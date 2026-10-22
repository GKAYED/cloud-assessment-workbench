import AssessmentReportLegacy from './AssessmentReport';
import AssessmentReportV2 from './AssessmentReportV2';
import { useProfile } from '../hooks/useProfile';

export default function AssessmentReportRoute() {
  const { activeProfile } = useProfile();

  if (activeProfile?.report_version === 'v2') {
    return <AssessmentReportV2 />;
  }

  return <AssessmentReportLegacy />;
}
