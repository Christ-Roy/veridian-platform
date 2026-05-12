---
title: "Grafana Cloud Access Policies | Grafana Cloud documentation"
description: "Grafana Cloud Access Policies implement an authorization process for actions requested on Grafana Mimir (metrics), Grafana Loki (logs), Grafana Tempo (traces), and Grafana Cloud Alerts services as well as some Grafana Cloud API endpoints."
---

# Grafana Cloud Access Policies

Grafana Cloud Access Policies implement an authorization process for:

- Actions requested on instances of your [Grafana Cloud Stack](/docs/grafana-cloud/account-management/cloud-stacks/), such as integrating with Grafana Mimir (metrics), Grafana Loki (logs), Grafana Tempo (traces), and more.
- Interacting with [Grafana Cloud API endpoints](/docs/grafana-cloud/developer-resources/api-reference/cloud-api/).

This page describes Cloud Access Policy concepts. To create an Access Policy and associated token, follow [the instructions to authorize your service](/docs/grafana-cloud/security-and-account-management/authentication-and-permissions/access-policies/using-an-access-policy-token/).

> Note
> 
> Grafana Cloud Access Policies do not authorize access to the Grafana instance [HTTP API](/docs/grafana-cloud/developer-resources/api-reference/http-api/). To automate Grafana UI tasks such as dashboard provisioning, user management, or data source configuration, use [service accounts](/docs/grafana/latest/administration/service-accounts/) instead.

Access policies contain [tokens](#tokens), which grant other applications access to take certain actions on your Grafana Cloud hosted services. You can create one or more tokens for each access policy and use those tokens when configuring Grafana Alloy, setting up a Grafana data source, provisioning alerts, or otherwise interacting with Grafana Cloud’s APIs.

An individual access policy is composed of one or more **scopes** and a **realm**.

The [**scope**](#scopes) is a specific action on a specific service. For example, the `metrics:read` scope defines an action that reads data from the Mimir service. The `logs:write` scope defines an action that creates data in the Loki service.

The [**realm**](#realms) identifies whether the scope will be applied during authorization to an `org` (organization) or to a `stack` (a set of services).

A decision to authorize an API request is made by comparing the request’s token with the associated Grafana Cloud access policy. If the API request performs an action that is allowed by an access policy (identified by the token), the API request is authorized.

In addition to [scopes](#scopes) and [realms](#realms), access policies also support IP range based access controls. For more information, refer to [IP range based access control](#ip-range-based-access-control).

For an introduction to Grafana Cloud Access Policies, read the November 22, 2022, blog post by Ryan Melendez, “[Grafana Cloud Access Policies: Say hi to the new Cloud API keys](/blog/2022/11/22/grafana-cloud-access-policies-say-hi-to-the-new-cloud-api-keys/).”


## Use with the API, Grafana Stacks, and Cloud Portal

You can use access policies via the API, the Grafana Administration settings, and the Cloud Portal. The Grafana Cloud Access Policies API adds two new API endpoints points for access policies (`/v1/accesspolicies`) and tokens (`/v1/tokens`). These endpoints are described in the [Grafana Cloud API documentation](../../../developer-resources/api-reference/cloud-api/#access-policies-and-tokens).


| Access policy interface | Access policies for stacks | Access policies for an organization | Requires Cloud Portal Admin role | Requires Grafana Admin role |
|-------------------------|----------------------------|-------------------------------------|----------------------------------|-----------------------------|
| Cloud API               | Yes                        | Yes                                 | Yes                              | No                          |
| In a Grafana Stack      | Single stack where created | No                                  | No                               | Yes                         |
| Cloud Portal            | Yes                        | Yes                                 | Yes                              | No                          |

The Access Policies page in the Cloud Portal lets you manage access policies and tokens across an organization and all of its stacks.

[The Access Policies page in the Cloud Portal](/static/img/docs/grafana-cloud/access-policies/policies-cloud-portal.png)

The Cloud access policies in the Grafana Administration settings allow access policies and tokens to be managed for a specific stack.

[The Cloud access policies page.](/static/img/docs/grafana-cloud/access-policies/access-policies-ui.png)

## Access policies

Each *access policy* has one or more tokens, a realm, one or more scopes, and optional label filters. The table above summarizes access policies for stacks and organizations.

Each access policy has a unique name within an organization. Access policies are only used within one Grafana Cloud organization and do not span multiple organizations.

For more information about stacks and organizations, refer to the Grafana Cloud Stack section of [Use the Cloud Portal to manage your Grafana Cloud account](../../cloud-portal/).

## Realms

A *realm* has a type, such as organization or stack, an identifier, and a list of [label policies](#labelpolicy-or-label-selectors). A realm must be specified when using the API or the Access Policies page in the Cloud Portal, but the realm is automatically set when managing access policies in the Grafana Administration settings.

You can specify an organization or stack ID. The `org` realm type can be used for applying access policies to any stack within an organization. If you specify a `stack` realm type, then the tokens under that particular policy can be used only for that stack.

## Tokens

A *token* belongs to an access policy and is used programmatically to identify the entity that requests actions on resources. Authorization is based on rules defined by an access policy and the token presented with a request. An access policy can have one or more tokens.

Tokens are created in the same places as access policies. You can use the Cloud Access Policy API, the Access Policies page in the Cloud Portal, or the Cloud access policies page in the Grafana Administration settings. Any tokens defined in the Grafana Administration settings are limited to that Grafana’s stack.

### Token expiration

Tokens can optionally have an expiration date. If a token is configured to expire, it stops working after the specified date. You can locate expired tokens in the Access Policies page, where they are indicated as “Expired.”

Expiration dates can optionally be limited to a maximum number of days. If a maximum token expiration is configured for an organization, you will not be allowed to create or update a token with an expiration date beyond the maximum days set. This can be enforced by going to the Settings page under **Org Settings** in the Cloud Portal and selecting the **Enforce token expiration** checkbox. After selecting **Enforce token expiration**, you can input a limit in the **Max token expiration days** input box.

Before a token reaches its expiration date, warning emails are sent to the relevant administrators by default, depending on the realm in the token’s access policy:

- `stack` realm: Warning emails are sent to the admins of the corresponding stack.
- `org` realm: Warning emails are sent to the admins of the associated Cloud Portal organization.

You can turn off these warning emails by going to the Settings page under **Org Settings** in the Cloud Portal and clearing the **Enable token expiration emails** checkbox.

## Scopes

A *scope* defines which permissions a token has. For example, `metrics:read`, `metrics:write`, etc. Scopes let you specify which actions can be performed with resources such as metrics, logs, traces, alerts, rules, and access policies. Additional scopes are available within the Cloud Portal UI.


| Service                          | Description                                                                                     | Identifier                            |
|----------------------------------|-------------------------------------------------------------------------------------------------|---------------------------------------|
| Access Policies                  | Delete access policies.                                                                         | accesspolicies:delete                 |
| Access Policies                  | Read access policies.                                                                           | accesspolicies:read                   |
| Access Policies                  | Create and edit access policies.                                                                | accesspolicies:write                  |
| Active User Reports              | Create and edit active user reports.                                                            | active-user-reports:write             |
| Adaptive Logs                    | Access and edit patterns and sample rates for Adaptive Logs                                     | adaptive-logs:admin                   |
| Adaptive Metrics Config          | Read access for Adaptive Metrics configuration                                                  | adaptive-metrics-config:read          |
| Adaptive Metrics Config          | Write access for Adaptive Metrics configuration                                                 | adaptive-metrics-config:write         |
| Adaptive Metrics Exemptions      | Delete access for Adaptive Metrics exemptions                                                   | adaptive-metrics-exemptions:delete    |
| Adaptive Metrics Exemptions      | Read access for Adaptive Metrics exemptions                                                     | adaptive-metrics-exemptions:read      |
| Adaptive Metrics Exemptions      | Write access for Adaptive Metrics exemptions                                                    | adaptive-metrics-exemptions:write     |
| Adaptive Metrics Recommendations | Read access for Adaptive Metrics recommendations                                                | adaptive-metrics-recommendations:read |
| Adaptive Metrics Rules           | Delete access for Adaptive Metrics rules                                                        | adaptive-metrics-rules:delete         |
| Adaptive Metrics Rules           | Read access for Adaptive Metrics rules                                                          | adaptive-metrics-rules:read           |
| Adaptive Metrics Rules           | Write access for Adaptive Metrics rules                                                         | adaptive-metrics-rules:write          |
| Agent management                 | Read from agent management API.                                                                 | agentmanagement:read                  |
| Agent management                 | Create and edit within agent management API.                                                    | agentmanagement:write                 |
| Alert State History              | Read Grafana’s log-based Alert State History from a Grafana Cloud stack.                        | alert-state-history:read              |
| Alerts                           | Read alerts from a Grafana Cloud stack.                                                         | alerts:read                           |
| Alerts                           | Write alerts to a Grafana Cloud stack.                                                          | alerts:write                          |
| Asserts Assertion Detector       | Grants access to send alerts to the Asserts assertion alertmanager webhook                      | asserts-assertion-detector:write      |
| Audit Logs                       | Read audit logs.                                                                                | audit-logs:read                       |
| Billing Metrics                  | Read billing metrics from a Grafana Cloud stack.                                                | billing-metrics:read                  |
| Credit Cards                     | Delete credit cards on Grafana.com.                                                             | credit-cards:delete                   |
| Credit Cards                     | Read credit cards on Grafana.com.                                                               | credit-cards:read                     |
| Credit Cards                     | Create and edit credit cards on Grafana.com.                                                    | credit-cards:write                    |
| Dashboard Reviews                | Delete dashboard reviews.                                                                       | dashboard-reviews:delete              |
| Dashboard Reviews                | Create and edit dashboard reviews.                                                              | dashboard-reviews:write               |
| Dashboards                       | Delete dashboards on Grafana.com.                                                               | dashboards:delete                     |
| Dashboards                       | Read dashboards on Grafana.com.                                                                 | dashboards:read                       |
| Dashboards                       | Create and edit dashboards on Grafana.com.                                                      | dashboards:write                      |
| Datasources                      | Delete datasources from Grafana instance within a Grafana Cloud stack from Grafana.com.         | datasources:delete                    |
| Datasources                      | Read datasources for Grafana instance within a Grafana Cloud stack from Grafana.com.            | datasources:read                      |
| Datasources                      | Create and edit datasources for Grafana instance within a Grafana Cloud stack from Grafana.com. | datasources:write                     |
| Fleet Management                 | Provides read access to Fleet Management.                                                       | fleet-management:read                 |
| Fleet Management                 | Provides write access to Fleet Management.                                                      | fleet-management:write                |
| Incident                         | Create and edit within incident API.                                                            | incident:write                        |
| Insight Logs                     | Read insight logs from a Grafana Cloud stack.                                                   | insight-logs:read                     |
| Integration Management           | Read from integration management API.                                                           | integration-management:read           |
| Integration Management           | Create and edit within integration management API.                                              | integration-management:write          |
| Invites                          | Delete organization invites on Grafana.com.                                                     | invites:delete                        |
| Invites                          | Read organization invites on Grafana.com.                                                       | invites:read                          |
| Invites                          | Create and edit organization invites on Grafana.com.                                            | invites:write                         |
| Invoices                         | Read invoices from Grafana.com.                                                                 | invoices:read                         |
| License Tokens                   | Delete license tokens on Grafana.com.                                                           | license-tokens:delete                 |
| License Tokens                   | Read license tokens on Grafana.com.                                                             | license-tokens:read                   |
| License Tokens                   | Create and edit license tokens on Grafana.com.                                                  | license-tokens:write                  |
| Licenses                         | Delete licenses on Grafana.com.                                                                 | licenses:delete                       |
| Licenses                         | Read licenses on Grafana.com.                                                                   | licenses:read                         |
| Licenses                         | Access and manage licenses.                                                                     | licenses:write                        |
| Logs                             | Delete logs from a Grafana Cloud stack.                                                         | logs:delete                           |
| Logs                             | Read logs from a Grafana Cloud stack.                                                           | logs:read                             |
| Logs                             | Write logs to a Grafana Cloud stack.                                                            | logs:write                            |
| Metrics                          | Delete metrics from a Grafana Cloud stack.                                                      | metrics:delete                        |
| Metrics                          | Import metrics to a Grafana Cloud stack.                                                        | metrics:import                        |
| Metrics                          | Read metrics from a Grafana Cloud stack.                                                        | metrics:read                          |
| Metrics                          | Write metrics to a Grafana Cloud stack.                                                         | metrics:write                         |
| Mlops                            | Read from machine learning ops API.                                                             | mlops:read                            |
| Mlops                            | Create and edit within machine learning ops API.                                                | mlops:write                           |
| Oauth Clients                    | Delete OAuth clients from Grafana.com.                                                          | oauth-clients:delete                  |
| Oauth Clients                    | Read OAuth clients from Grafana.com.                                                            | oauth-clients:read                    |
| Oauth Clients                    | Create and edit OAuth clients from Grafana.com.                                                 | oauth-clients:write                   |
| Oauth Codes                      | Delete OAuth codes from Grafana.com.                                                            | oauth-codes:delete                    |
| Oauth Codes                      | Read OAuth codes from Grafana.com.                                                              | oauth-codes:read                      |
| Oauth Codes                      | Create and edit OAuth codes for Grafana.com.                                                    | oauth-codes:write                     |
| Oauth Grants                     | Delete OAuth grants.                                                                            | oauth-grants:delete                   |
| Oauth Grants                     | Read OAuth grants.                                                                              | oauth-grants:read                     |
| Oauth Grants                     | Create OAuth grants.                                                                            | oauth-grants:write                    |
| Oauth Tokens                     | Delete OAuth tokens from Grafana.com.                                                           | oauth-tokens:delete                   |
| Oauth Tokens                     | Read OAuth tokens from Grafana.com.                                                             | oauth-tokens:read                     |
| Org Billing Info                 | Read organization billing info from Grafana.com.                                                | org-billing-info:read                 |
| Org Billing Info                 | Create and edit organization billing info within Grafana.com.                                   | org-billing-info:write                |
| Org Billing Rate                 | Read organization billing rates from Grafana.com.                                               | org-billing-rate:read                 |
| Org Billing Rate                 | Create and edit organization billing rates within Grafana.com.                                  | org-billing-rate:write                |
| Org Members                      | Delete Grafana.com organization members.                                                        | org-members:delete                    |
| Org Members                      | Read Grafana.com organization members.                                                          | org-members:read                      |
| Org Members                      | Create and edit Grafana.com organization members.                                               | org-members:write                     |
| Org Overage Bills                | Access and manage org overage bills.                                                            | org-overage-bills:write               |
| Org Referral Codes               | Read referral codes from Grafana.com.                                                           | org-referral-codes:read               |
| Org Referral Codes               | Create and edit org referral codes.                                                             | org-referral-codes:write              |
| Orgs                             | Delete organizations from Grafana.com.                                                          | orgs:delete                           |
| Orgs                             | Read organizations from Grafana.com.                                                            | orgs:read                             |
| Orgs                             | Create and edit organizations within Grafana.com.                                               | orgs:write                            |
| Payments                         | Make payments for Grafana.com.                                                                  | payments:write                        |
| Pdc                              | Delete PDC on Grafana Cloud stack.                                                              | pdc:delete                            |
| Pdc                              | Read PDC on Grafana Cloud stack.                                                                | pdc:read                              |
| Pdc                              | Create and edit PDC on Grafana Cloud stack.                                                     | pdc:write                             |
| Plugin Submission Comments       | Create plugin submission comments on Grafana.com.                                               | plugin-submission-comments:write      |
| Plugin Submissions               | Delete plugin submissions on Grafana.com.                                                       | plugin-submissions:delete             |
| Plugin Submissions               | Read plugin submissions on Grafana.com.                                                         | plugin-submissions:read               |
| Plugin Submissions               | Create and edit plugin submissions on Grafana.com.                                              | plugin-submissions:write              |
| Plugin Versions                  | Delete version of plugin on Grafana.com.                                                        | plugin-versions:delete                |
| Plugin Versions                  | Update version of plugin on Grafana.com.                                                        | plugin-versions:write                 |
| Plugins                          | Create and edit plugins on Grafana.com.                                                         | plugins:write                         |
| Profiles                         | Read profiles from a Grafana Cloud stack.                                                       | profiles:read                         |
| Profiles                         | Write profiles to a Grafana Cloud stack.                                                        | profiles:write                        |
| Provisioned Plugins              | Delete plugins which are provisioned onto Grafana Cloud stack.                                  | provisioned-plugins:delete            |
| Provisioned Plugins              | Read plugins which are provisioned onto Grafana Cloud stack.                                    | provisioned-plugins:read              |
| Provisioned Plugins              | Create and edit plugins which are provisioned onto Grafana Cloud stack.                         | provisioned-plugins:write             |
| Referral Codes                   | Delete referral codes.                                                                          | referral-codes:delete                 |
| Referral Codes                   | Read referral codes.                                                                            | referral-codes:read                   |
| Referral Codes                   | Create and edit referral codes.                                                                 | referral-codes:write                  |
| Relabel Rules                    | Read relabel rules from a Grafana Cloud stack.                                                  | relabel-rules:read                    |
| Relabel Rules                    | Create and edit relabel rules for a Grafana Cloud stack.                                        | relabel-rules:write                   |
| Repository Tokens                | Delete repository tokens on Grafana.com.                                                        | repository-tokens:delete              |
| Repository Tokens                | Read repository tokens on Grafana.com.                                                          | repository-tokens:read                |
| Repository Tokens                | Create and edit repository tokens on Grafana.com.                                               | repository-tokens:write               |
| Rules                            | Read rules from a Grafana Cloud stack.                                                          | rules:read                            |
| Rules                            | Create and edit rules for a Grafana Cloud stack.                                                | rules:write                           |
| Service Model                    | Delete Service Catalog                                                                          | service-model:delete                  |
| Service Model                    | Read Service Catalog                                                                            | service-model:read                    |
| Service Model                    | Create Service Catalog                                                                          | service-model:write                   |
| Slos                             | Delete SLOs                                                                                     | slos:delete                           |
| Slos                             | Read SLOs                                                                                       | slos:read                             |
| Slos                             | Create SLOs                                                                                     | slos:write                            |
| Sourcemaps                       | Delete stored source maps using the Frontend Observability API                                  | sourcemaps:delete                     |
| Sourcemaps                       | Read source maps from the Frontend Observability API                                            | sourcemaps:read                       |
| Sourcemaps                       | Write (upload) source maps to the Frontend Observability API                                    | sourcemaps:write                      |
| Sso Configs                      | Delete SSO configs from Grafana.com.                                                            | sso-configs:delete                    |
| Sso Configs                      | Read SSO configs from Grafana.com.                                                              | sso-configs:read                      |
| Sso Configs                      | Create and edit SSO configs.                                                                    | sso-configs:write                     |
| Stack Api Keys                   | Create API keys for a Grafana instance within a Grafana Cloud stack from Grafana.com.           | stack-api-keys:write                  |
| Stack Config                     | Read stack config.                                                                              | stack-config:read                     |
| Stack Config                     | Create and edit stack config.                                                                   | stack-config:write                    |
| Stack Dashboards                 | Delete dashboards from Grafana instance within a Grafana Cloud stack from Grafana.com.          | stack-dashboards:delete               |
| Stack Dashboards                 | Read dashboards for Grafana instance within a Grafana Cloud stack from Grafana.com.             | stack-dashboards:read                 |
| Stack Dashboards                 | Create and edit dashboards for Grafana instance within a Grafana Cloud stack from Grafana.com.  | stack-dashboards:write                |
| Stack Logs                       | Read stack logs.                                                                                | stack-logs:read                       |
| Stack Oauth                      | Read OAuth config for Grafana Cloud stacks from Grafana.com.                                    | stack-oauth:read                      |
| Stack Oauth                      | Create and edit OAuth config for Grafana Cloud stacks from Grafana.com.                         | stack-oauth:write                     |
| Stack Plugins                    | Delete plugins from Grafana instance within a Grafana Cloud stack from Grafana.com.             | stack-plugins:delete                  |
| Stack Plugins                    | Read plugins for Grafana instance within a Grafana Cloud stack from Grafana.com.                | stack-plugins:read                    |
| Stack Plugins                    | Create and edit plugins for Grafana instance within a Grafana Cloud stack from Grafana.com.     | stack-plugins:write                   |
| Stack Service Accounts           | Create service accounts for a Grafana instance within a Grafana Cloud stack from Grafana.com.   | stack-service-accounts:write          |
| Stack Stats                      | Create and edit stack stats.                                                                    | stack-stats:write                     |
| Stack Users                      | Read Grafana Cloud stack users from Grafana.com.                                                | stack-users:read                      |
| Stack Users                      | Create and edit stack users.                                                                    | stack-users:write                     |
| Stacks                           | Delete Grafana Cloud stacks from Grafana.com.                                                   | stacks:delete                         |
| Stacks                           | Read Grafana Cloud stacks from Grafana.com.                                                     | stacks:read                           |
| Stacks                           | Create and edit Grafana Cloud stacks from Grafana.com.                                          | stacks:write                          |
| Subscription Usage Configs       | Access and manage subscription usage configs.                                                   | subscription-usage-configs:delete     |
| Subscription Usage Configs       | Read subscription usage configs from Grafana.com.                                               | subscription-usage-configs:read       |
| Subscription Usage Configs       | Access and manage subscription usage configs.                                                   | subscription-usage-configs:write      |
| Subscriptions                    | Read subscriptions from Grafana.com.                                                            | subscriptions:read                    |
| Subscriptions                    | Create and edit subscriptions within Grafana.com.                                               | subscriptions:write                   |
| Support Ticket Comments          | Delete support tickets on Grafana.com.                                                          | support-ticket-comments:write         |
| Support Tickets                  | Read support tickets on Grafana.com.                                                            | support-tickets:read                  |
| Support Tickets                  | Create and edit support tickets on Grafana.com.                                                 | support-tickets:write                 |
| Traces                           | Delete traces from a Grafana Cloud stack.                                                       | traces:delete                         |
| Traces                           | Read traces from a Grafana Cloud stack.                                                         | traces:read                           |
| Traces                           | Write traces to a Grafana Cloud stack.                                                          | traces:write                          |

The scopes you select limit the Grafana Cloud services you can query and the actions you can perform using the given access policy. Let’s say that you want to read metrics, traces, and logs and not write them. In this case, the access policy includes the `metrics:read`, `logs:read,` and `traces:read` scopes.

In the Grafana Administration settings, the same set of scopes, `metrics:read`, `logs:read`, and `traces:read`, are selected using checkboxes.

[The available scopes in Cloud access policies within a stack.](/static/img/docs/grafana-cloud/access-policies/policies-plugin-scopes.png)

The Access Policies page in the Cloud Portal also has these scopes. You can specify a different realm using the Access policies page in the Cloud Portal.

## LabelPolicy or Label selectors

A **LabelPolicy** is a set of [Prometheus label selectors](https://prometheus.io/docs/prometheus/latest/querying/basics/#time-series-selectors) used to limit metrics and logs data to specific label criteria. For example, adding a label policy of `{env="dev"}` returns matches from the dev environment. If you create an access policy with that label selector, then entities with a token for that access policy will only be able to query for metrics or logs that include the `{ env="dev" }` label.

LabelPolicies are only available for reading logs and metrics.

In the Cloud Access Policies Plugin, `LabelPolicies` are referred to as **Label selectors**.

Refer to [Using label-based access control with access policies](label-access-policies/) for additional information.

## IP range based access control

You can use IP range based access control with access policies to limit access to your Grafana Cloud services based on IP subnets. When configured, all tokens created under the access policy will obey the settings. Connections initiated from IP addresses outside of the specified ranges will be denied.

Refer to [Using IP range based access control with access policies](ip-ranges-access-policies/) for additional information.
