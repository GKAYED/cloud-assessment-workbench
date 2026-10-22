/**
 * Resource naming helpers for readable Azure labels in charts and tables.
 */

// Labels are sourced directly from the Azure portal TYPE column.
// Rule: only add an entry here if the Azure portal TYPE is confirmed.
// If a type has no entry, the raw source value is shown unchanged (no guessing).
const RESOURCE_TYPE_LABELS: Record<string, string> = {
  // Compute — confirmed from Azure portal TYPE column
  'microsoft.compute/virtualmachines': 'Virtual machine',
  'microsoft.compute/disks': 'Disk',
  'microsoft.compute/snapshots': 'Snapshot',
  'microsoft.compute/availabilitysets': 'Availability set',
  'microsoft.compute/virtualmachinescalesets': 'Virtual machine scale set',
  'microsoft.compute/images': 'Image',
  'microsoft.compute/galleries': 'Azure Compute Gallery',
  'microsoft.compute/galleries/images': 'VM Image definition',
  'microsoft.compute/galleries/images/versions': 'VM Image version',
  'microsoft.compute/proximityplacementgroups': 'Proximity placement group',
  'microsoft.compute/hostgroups': 'Dedicated host group',
  'microsoft.compute/hosts': 'Dedicated host',
  'microsoft.compute/diskencryptionsets': 'Disk encryption set',
  'microsoft.compute/restorepointcollections': 'Restore point collection',
  // Networking — confirmed from Azure portal TYPE column
  'microsoft.network/virtualnetworks': 'Virtual network',
  'microsoft.network/networkinterfaces': 'Network interface',
  'microsoft.network/networksecuritygroups': 'Network security group',
  'microsoft.network/loadbalancers': 'Load balancer',
  'microsoft.network/applicationgateways': 'Application gateway',
  'microsoft.network/applicationgatewaywebapplicationfirewallpolicies': 'Web application firewall policy',
  'microsoft.network/publicipaddresses': 'Public IP address',
  'microsoft.network/publicipprefixes': 'Public IP prefix',
  'microsoft.network/privateendpoints': 'Private endpoint',
  'microsoft.network/privatednszones': 'Private DNS zone',
  'microsoft.network/privatednszones/virtualnetworklinks': 'Virtual network link',
  'microsoft.network/dnszones': 'DNS zone',
  'microsoft.network/routetables': 'Route table',
  'microsoft.network/expressroutecircuits': 'ExpressRoute circuit',
  'microsoft.network/expressroutegateways': 'ExpressRoute gateway',
  'microsoft.network/virtualnetworkgateways': 'Virtual network gateway',
  'microsoft.network/connections': 'Connection',
  'microsoft.network/localnetworkgateways': 'Local network gateway',
  'microsoft.network/vpngateways': 'VPN gateway',
  'microsoft.network/vpnsites': 'VPN site',
  'microsoft.network/virtualwans': 'Virtual WAN',
  'microsoft.network/virtualhubs': 'Virtual hub',
  'microsoft.network/frontdoors': 'Front Door and CDN profile',
  'microsoft.network/trafficmanagerprofiles': 'Traffic Manager profile',
  'microsoft.network/natgateways': 'NAT gateway',
  'microsoft.network/bastionhosts': 'Bastion',
  'microsoft.network/ddosprotectionplans': 'DDoS protection plan',
  'microsoft.network/firewallpolicies': 'Firewall Policy',
  'microsoft.network/azurefirewalls': 'Firewall',
  'microsoft.network/ipgroups': 'IP Group',
  'microsoft.network/applicationsecuritygroups': 'Application security group',
  'microsoft.network/privatelinkservices': 'Private link service',
  'microsoft.network/serviceendpointpolicies': 'Service endpoint policy',
  'microsoft.network/networkwatchers': 'Network Watcher',
  'microsoft.network/networkwatchers/flowlogs': 'Flow log',
  'microsoft.cdn/profiles': 'Front Door and CDN profile',
  'microsoft.cdn/profiles/endpoints': 'CDN endpoint',
  // Web & App Services — confirmed from Azure portal TYPE column
  'microsoft.web/serverfarms': 'App service plan',
  'microsoft.web/sites': 'App Service',
  'microsoft.web/sites/slots': 'App Service (Slot)',
  'microsoft.web/connections': 'API connection',
  'microsoft.web/customapis': 'Logic app custom connector',
  'microsoft.web/staticsites': 'Static Web App',
  'microsoft.web/certificates': 'App Service certificate',
  // Storage — confirmed from Azure portal TYPE column
  'microsoft.storage/storageaccounts': 'Storage account',
  'microsoft.storage/storageaccounts/blobservices': 'Blob service',
  'microsoft.storage/storageaccounts/fileservices': 'File service',
  // Databases — confirmed from Azure portal TYPE column
  'microsoft.sql/servers': 'SQL server',
  'microsoft.sql/servers/databases': 'SQL database',
  'microsoft.sql/servers/elasticpools': 'SQL elastic pool',
  'microsoft.sql/managedinstances': 'SQL Managed Instance',
  'microsoft.sql/managedinstances/databases': 'SQL Managed Instance database',
  'microsoft.documentdb/databaseaccounts': 'Azure Cosmos DB account',
  'microsoft.dbforpostgresql/servers': 'Azure Database for PostgreSQL server',
  'microsoft.dbforpostgresql/flexibleservers': 'Azure Database for PostgreSQL flexible server',
  'microsoft.dbformysql/servers': 'Azure Database for MySQL server',
  'microsoft.dbformysql/flexibleservers': 'Azure Database for MySQL flexible server',
  'microsoft.dbformariadb/servers': 'Azure Database for MariaDB server',
  'microsoft.cache/redis': 'Azure Cache for Redis',
  // Security & Identity — confirmed from Azure portal TYPE column
  'microsoft.keyvault/vaults': 'Key vault',
  'microsoft.keyvault/managedhsms': 'Managed HSM',
  'microsoft.managedidentity/userassignedidentities': 'User assigned identity',
  'microsoft.security/automations': 'Automation',
  'microsoft.authorization/policyassignments': 'Policy assignment',
  'microsoft.authorization/policydefinitions': 'Policy definition',
  'microsoft.authorization/policysetdefinitions': 'Policy initiative',
  // Monitoring & Management — confirmed from Azure portal TYPE column
  'microsoft.operationalinsights/workspaces': 'Log Analytics workspace',
  'microsoft.insights/components': 'Application Insights',
  'microsoft.insights/actiongroups': 'Action group',
  'microsoft.insights/activitylogalerts': 'Activity log alert',
  'microsoft.insights/metricalerts': 'Metric alert rule',
  'microsoft.insights/scheduledqueryrules': 'Log search alert rule',
  'microsoft.insights/webtests': 'Availability test',
  'microsoft.insights/workbooks': 'Azure Workbook',
  'microsoft.insights/datacollectionrules': 'Data collection rule',
  'microsoft.insights/autoscalesettings': 'Autoscale setting',
  'microsoft.monitor/accounts': 'Azure Monitor workspace',
  'microsoft.operationsmanagement/solutions': 'Solution',
  'microsoft.automation/automationaccounts': 'Automation account',
  // Integration — confirmed from Azure portal TYPE column
  'microsoft.datafactory/factories': 'Data factory (V2)',
  'microsoft.logic/workflows': 'Logic app',
  'microsoft.servicebus/namespaces': 'Service Bus Namespace',
  'microsoft.eventhub/namespaces': 'Event Hubs Namespace',
  'microsoft.eventgrid/topics': 'Event Grid Topic',
  'microsoft.eventgrid/domains': 'Event Grid Domain',
  'microsoft.eventgrid/systemtopics': 'Event Grid System Topic',
  'microsoft.eventgrid/eventsubscriptions': 'Event Grid Subscription',
  'microsoft.apimanagement/service': 'API Management service',
  'microsoft.search/searchservices': 'AI Search',
  // Analytics & AI — confirmed from Azure portal TYPE column
  'microsoft.synapse/workspaces': 'Azure Synapse Analytics',
  'microsoft.databricks/workspaces': 'Azure Databricks Service',
  // Note: microsoft.cognitiveservices/accounts maps to different portal names depending on
  // the resource kind (Azure OpenAI, Computer Vision, Speech, etc.). No single label applies.
  'microsoft.machinelearningservices/workspaces': 'Machine learning',
  'microsoft.botservice/botservices': 'Bot Service',
  'microsoft.maps/accounts': 'Azure Maps Account',
  // Containers — confirmed from Azure portal TYPE column
  'microsoft.containerservice/managedclusters': 'Kubernetes service',
  'microsoft.containerregistry/registries': 'Container registry',
  'microsoft.app/containerapps': 'Container App',
  'microsoft.app/managedenvironments': 'Container Apps Environment',
  'microsoft.containerinstance/containergroups': 'Container instance',
  // Messaging & Communication — confirmed from Azure portal TYPE column
  'microsoft.signalrservice/signalr': 'SignalR Service',
  'microsoft.communication/communicationservices': 'Communication service',
  'microsoft.communication/emailservices': 'Email Communication Service',
  'microsoft.communication/emailservices/domains': 'Email domain',
  'microsoft.notificationhubs/namespaces': 'Notification Hub Namespace',
  // IoT — confirmed from Azure portal TYPE column
  'microsoft.devices/iothubs': 'IoT Hub',
  'microsoft.devices/provisioningservices': 'IoT Hub Device Provisioning Service',
  'microsoft.iotcentral/iotapps': 'IoT Central application',
  // Backup & Recovery — confirmed from Azure portal TYPE column
  'microsoft.recoveryservices/vaults': 'Recovery Services vault',
  'microsoft.backup/backupvaults': 'Backup vault',
  // Virtual Desktop & Labs
  'microsoft.desktopvirtualization/workspaces': 'Azure Virtual Desktop workspace',
  'microsoft.desktopvirtualization/hostpools': 'Host pool',
  'microsoft.desktopvirtualization/applicationgroups': 'Application group',
  'microsoft.devtestlab/labs': 'DevTest lab',
  // Governance & Portal
  'microsoft.resources/resourcegroups': 'Resource group',
  'microsoft.portal/dashboards': 'Shared dashboard',
  'microsoft.resources/deployments': 'Deployment',
  'microsoft.resources/templatespecs': 'Template spec',
};

const RESOURCE_TYPE_HINTS: Record<string, string> = {
  'microsoft.web/serverfarms':
    'App service plans are the compute hosting plans that run Azure Web Apps and Function Apps.',
};

export function normalizeResourceTypeName(value: string): string {
  const key = (value ?? '').trim().toLowerCase();
  if (!key) return '';
  if (RESOURCE_TYPE_LABELS[key]) return RESOURCE_TYPE_LABELS[key];
  // No mapping found — return source value exactly as-is (no prettification or guessing)
  return value;
}

export function getResourceTypeHint(value: string): string | null {
  const key = (value ?? '').trim().toLowerCase();
  return RESOURCE_TYPE_HINTS[key] ?? null;
}
