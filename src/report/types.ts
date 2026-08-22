import type { SchoolOverview, StudentInterviewGuide } from '../analysis/provider';

export interface Report {
  title: string;
  schoolName: string;
  cohort: string;
  generatedAt: string; // YYYY-MM-DD HH:mm
  overview: SchoolOverview;
  studentGuides: StudentInterviewGuide[];
}
