/**
 * The resource ids of resources must be unique. Since we might create resources for a branch multiple times
 * (after destroying the ones created before maybe failed, e.g. on environment cleanup, reopening a branch), we ensure uniqueness
 * by appending some random data to resource ids in order to avoid collisions.
 */
resource "random_id" "main" {
  byte_length = 2
  prefix      = "volunteering-api-${local.environment_name}-"
}

resource "google_sql_database" "database" {
  name     = random_id.main.hex
  project  = data.terraform_remote_state.holi_infra_state.outputs.shared_project_id
  instance = local.environment_name == "production" ? data.terraform_remote_state.holi_infra_state.outputs.database_name_production : data.terraform_remote_state.holi_infra_state.outputs.database_name_development
}

output "database_name" {
  value = google_sql_database.database.name
}

resource "google_project_service" "service" {
  for_each = toset([
    "run.googleapis.com",
    "servicecontrol.googleapis.com",
    "servicemanagement.googleapis.com",
  ])

  service = each.key

  project = data.terraform_remote_state.holi_infra_state.outputs.shared_project_id
  # keep this property as false. Having it true caused https://holi.atlassian.net/wiki/spaces/HOLI/pages/348258312/2023-06-27+All+services+down
  disable_dependent_services = false
  disable_on_destroy         = false
}

# in CI, this is set via scripts/create-or-update-env.sh 
variable "image_tag" {
  type     = string
  nullable = false
}

resource "google_cloud_run_service" "volunteering_api" {
  project  = data.terraform_remote_state.holi_infra_state.outputs.shared_project_id
  name     = random_id.main.hex
  location = local.default_region # finland, low CO2 emissions
  # https://github.com/hashicorp/terraform-provider-google/issues/5898
  autogenerate_revision_name = true

  template {
    spec {
      service_account_name = data.terraform_remote_state.holi_volunteering_api_common_state.outputs.cloud_run_service_account_email
      containers {
        image = "${data.terraform_remote_state.holi_infra_state.outputs.artifact_registry_location}/holi-volunteering-api:${var.image_tag}"
        ports {
          container_port = 8004
        }
        liveness_probe {
          http_get {
            path = "/liveness"
          }
          timeout_seconds = 10
          period_seconds = 60
        }
        env {
          name  = "ENVIRONMENT"
          value = local.environment
        }
        env {
          name  = "CACHE_ENABLED"
          value = "true"
        }
        env {
          name  = "CACHE_TTL_MS_VOLTASTICS"
          value = local.environment == "production" ? "86400000" : "86400000" # 24 hours
        }
        env {
          name  = "CACHE_TTL_MS_DB"
          value = local.environment == "production" ? "3600000" : "3600000" # 1 hour
        }
        env {
          name  = "VOLUNTEERING_VOLTASTICS_API_URL"
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
        env {
          name  = "IMAGE_PROXY_BASE_URL"
          value = local.environment == "production" ? "https://images.holi.social" : "https://dev-images.holi.social"
        }

        env {
          name  = "DB_HOST"
          value = local.environment_name == "production" ? data.terraform_remote_state.holi_infra_state.outputs.database_ip_address_production : data.terraform_remote_state.holi_infra_state.outputs.database_ip_address_development
        }
        env {
          name  = "DB_PORT"
          value = "5432"
        }
        env {
          name  = "DB_NAME"
          value = google_sql_database.database.name
        }
        env {
          name = "DB_USERNAME"
          value_from {
            secret_key_ref {
              key  = "latest"
              name = local.environment_name == "production" ? "VOLUNTEERING_DB_USERNAME_PRODUCTION" : "VOLUNTEERING_DB_USERNAME_DEVELOPMENT"
            }
          }
        }
        env {
          name = "DB_PASSWORD"
          value_from {
            secret_key_ref {
              key  = "latest"
              name = local.environment_name == "production" ? "VOLUNTEERING_DB_PASSWORD_PRODUCTION" : "VOLUNTEERING_DB_PASSWORD_DEVELOPMENT"
            }
          }
        }
        env {
          name  = "GEO_API_ENDPOINT_URL"
          value = data.terraform_remote_state.holi_geo_api_environments_state.outputs.api_endpoint_url
        }
        resources {
          limits = {
            # cpu can only be scaled down to 1000m as long as container_concurrency is set to != 1
            cpu    = local.environment == "production" ? "1000m" : "1000m"
            memory = local.environment == "production" ? "512Mi" : "256Mi"
          }
          requests = {
            cpu    = local.environment == "production" ? "1000m" : "1000m"
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
        "autoscaling.knative.dev/maxScale" = local.environment == "production" ? "10" : "3"
        # Use the VPC Connector
        "run.googleapis.com/vpc-access-connector" = data.terraform_remote_state.holi_infra_state.outputs.vpc_access_connector_name
        # possible values: all-traffic/private-ranges-only(default) https://cloud.google.com/sdk/gcloud/reference/run/services/update#--vpc-egress
        "run.googleapis.com/vpc-access-egress" = "all-traffic"
      }
      # labels set on the revision level
      labels = {
        "environment_type" = local.environment_type
        "holi_service"     = "app-volunteering"
      }
    }
  }

  # only accept traffic from the internal network, not from the internet
  metadata {
    annotations = {
      # possible values: all/internal/internal-and-cloud-load-balancing https://cloud.google.com/sdk/gcloud/reference/run/services/update#--ingress
      "run.googleapis.com/ingress" = "internal"
    }
    # labels set on the service level
    labels = {
      "environment_type" = local.environment_type
      "holi_service"     = "app-volunteering"
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_project_service.service]
}

resource "google_cloud_run_domain_mapping" "holi_social_volunteering_api" {
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
