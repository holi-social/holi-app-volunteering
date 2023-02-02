locals {
  # predefined environment names are staging, production, and <branchname>
  environment      = terraform.workspace
  environment_name = trim(substr(local.environment, 0, 22), ".-") # limits the length of the name that it fits constraints google imposes for some resources, e.g. project ids

  cache_enabled = "true"
  cache_ttl_ms = local.environment == "production" ? "86400000" : "60000" # 24 hours for production, otherwise 1 minute

  # the dns name can be at most 64 chars in total
  dns_name = "${trimsuffix(substr(local.environment, 0, 34), ".-")}.${data.terraform_remote_state.holi_volunteering_api_common_state.outputs.dns_volunteering_api_domain}"
}
