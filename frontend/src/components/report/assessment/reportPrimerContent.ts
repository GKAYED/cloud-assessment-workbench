export type ReportPrimerContent = {
  about: string;
  summary: string;
  howToRead: string;
};

export const AZURE_INVENTORY_COST_PRIMER: ReportPrimerContent = {
  about:
    'This section acts as a structured inventory and cost baseline for the Azure estate at the assessment snapshot date. It brings together subscription, resource group, resource, database, and cost evidence into one factual reference pack.',
  summary:
    'The Azure estate is spread across multiple subscriptions and resource groups, with cost concentrated in a smaller number of major landing zones, hosting services, databases, gateways, monitoring services, and platform components. Tagging coverage remains incomplete, which reduces clarity for ownership, chargeback, and operational accountability.',
  howToRead:
    'Use this section as the factual baseline for what is in the estate and where spend is concentrated. It should be read alongside the main assessment narrative and snapshot notes, which explain limitations, interpretation, and cross-domain implications.',
};

export const DYNAMICS_PLATFORM_PRIMER: ReportPrimerContent = {
  about:
    'This section provides a focused overview of the Dynamics 365 and broader Power Platform footprint identified during the assessment. It combines discovered environment, workflow, solution, and user data with manually supplied workbook context to present a clearer platform baseline.',
  summary:
    'The Dynamics estate should be understood as a broader multi-environment business platform rather than a single CRM environment. API discovery returned a substantial active footprint, while customer-supplied exports confirmed an even wider estate spanning production, sandbox, development, migration, integration, and packaging uses.',
  howToRead:
    'Read this section in three parts: first as the discovered API-driven footprint, second as the immediate validation and cleanup priorities, and third as the manually added environment, Dataverse, and licensing context that extends what live discovery alone could show.',
};

export const SECURITY_COMPLIANCE_PRIMER: ReportPrimerContent = {
  about:
    'This section provides a focused view of the current Azure security, governance, and framework-alignment posture observed during the assessment. It combines Defender, Advisor, governance, and framework evidence into a practical baseline of current control health and improvement opportunities.',
  summary:
    'The current evidence points to a meaningful security and governance improvement backlog across technical posture and operational discipline. Defender, Advisor, policy, RBAC, orphaned-resource, and framework evidence together suggest an estate that is manageable, but carrying visible debt in hardening, governance consistency, and control follow-through.',
  howToRead:
    'Read this section as a posture and evidence baseline rather than the final interpretation of risk. The security and governance pages establish current control and hygiene signals, while the framework section shows how those signals align to WAF and CAF guidance and where deeper follow-up work is most likely to add value.',
};
