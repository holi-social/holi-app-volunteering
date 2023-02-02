/**
 * The resource ids of resources must be unique. Since we might create resources for a branch multiple times
 * (after destroying the ones created before maybe failed, e.g. on environment cleanup, reopening a branch), we ensure uniqueness
 * by appending some random data to resource ids in order to avoid collisions.
 */
resource "random_id" "main" {
  byte_length = 2
  prefix      = "volunteering-api-${local.environment_name}-"
}

resource "google_project_service" "service" {
  for_each = toset([
    "run.googleapis.com",
    "servicecontrol.googleapis.com",
    "servicemanagement.googleapis.com",
  ])

  service = each.key

  project            = data.terraform_remote_state.holi_infra_state.outputs.shared_project_id
  disable_on_destroy = false
}

# in CI, this is set via scripts/create-or-update-env.sh 
variable "image_tag" {
  type     = string
  nullable = false
}

resource "google_cloud_run_service" "volunteering_api" {
  project  = data.terraform_remote_state.holi_infra_state.outputs.shared_project_id
  name     = random_id.main.hex
  location = "europe-north1" # finland, low CO2 emissions
  # https://github.com/hashicorp/terraform-provider-google/issues/5898
  autogenerate_revision_name = true

  template {
    spec {
      service_account_name = data.terraform_remote_state.holi_volunteering_api_common_state.outputs.cloud_run_service_account_email
      containers {
        image = "${data.terraform_remote_state.holi_infra_state.outputs.gcr_location}/holi-volunteering-api:${var.image_tag}"
        ports {
          container_port = 8004
        }
        env {
          name  = "ENVIRONMENT"
          value = local.environment
        }
        env {
          name  = "CACHE_ENABLED"
          value = local.cache_enabled
        }
        env {
          name  = "CACHE_TTL_MS"
          value = local.cache_ttl_ms
        }
        env {
          name = "VOLUNTEERING_VOLTASTICS_API_URL"
          value = "https://backend.voltastics.de/api"
        }
        env {
          name = "VOLUNTEERING_VOLTASTICS_API_KEY"
          value_from {
            secret_key_ref {
              key  = "latest"
              name = "VOLUNTEERING_VOLTASTICS_API_KEY"
            }
          }
        }
        # env {
        #   name  = "ENVIRONMENT_ID"
        #   value = local.environment_name
        # }
        # env {
        #   name  = "SENTRY_DSN"
        #   value = "https://0e0fac0c76884e0a95432d780c4560fc@o949544.ingest.sentry.io/6741291"
        # }

        resources {
          limits = {
            # cpu can only be scaled down to 1000m as long as container_concurrency is set to != 1
            cpu    = local.environment == "production" ? "1000m" : "1000m"
            memory = local.environment == "production" ? "512Mi" : "256Mi"
          }
          requests = {
            cpu    = local.environment == "production" ? "1000m" : "10m"
            memory = local.environment == "production" ? "512Mi" : "256Mi"
          }
        }
      }
      container_concurrency = 0 # 0 means thread safe, no restriction on max concurrency
    }
    # template annotations: https://cloud.google.com/run/docs/reference/rpc/google.cloud.run.v1#revisiontemplate
    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = local.environment == "production" ? "1" : "0"
        "autoscaling.knative.dev/maxScale" = local.environment == "production" ? "10" : "1"
        # Use the VPC Connector
        "run.googleapis.com/vpc-access-connector" = data.terraform_remote_state.holi_infra_state.outputs.vpc_access_connector_name
        # possible values: all-traffic/private-ranges-only(default) https://cloud.google.com/sdk/gcloud/reference/run/services/update#--vpc-egress
        "run.googleapis.com/vpc-access-egress" = "private-ranges-only"
      }
    }
  }

  # only accept traffic from the internal network, not from the internet
  metadata {
    annotations = {
      # possible values: all/internal/internal-and-cloud-load-balancing https://cloud.google.com/sdk/gcloud/reference/run/services/update#--ingress
      "run.googleapis.com/ingress" = "internal"
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_project_service.service]
}

resource "google_cloud_run_domain_mapping" "volunteering_api" {
  project = google_cloud_run_service.volunteering_api.project
  # location needs to be the same as the service's
  location = google_cloud_run_service.volunteering_api.location
  name     = local.dns_name

  metadata {
    namespace = google_cloud_run_service.volunteering_api.project
  }

  spec {
    route_name = google_cloud_run_service.volunteering_api.name
  }
}

# TODO security: Can we restrict this to a specific service account (of the API proxy) some day?
data "google_iam_policy" "volunteering_api" {
  binding {
    role = "roles/run.invoker"
    members = [
      "allUsers",
    ]
  }
}

resource "google_cloud_run_service_iam_policy" "volunteering_api" {
  location = google_cloud_run_service.volunteering_api.location
  project  = google_cloud_run_service.volunteering_api.project
  service  = google_cloud_run_service.volunteering_api.name

  policy_data = data.google_iam_policy.volunteering_api.policy_data
}
