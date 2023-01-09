terraform {
  backend "gcs" {
    bucket = "holi-shared-terraform-state"
    prefix = "volunteering-api-environments"
  }
}

data "terraform_remote_state" "holi_infra_state" {
  backend = "gcs"
  config = {
    bucket = "holi-shared-terraform-state"
    prefix = "infra"
  }
}

data "terraform_remote_state" "holi_volunteering_api_common_state" {
  backend = "gcs"
  config = {
    bucket = "holi-shared-terraform-state"
    prefix = "volunteering-api-common"
  }
}

# provider google including beta features
provider "google" {
  region = "europe-north1"
}

provider "google-beta" {
  region = "europe-north1"
}
