export type GlossaryCategory =
  | "placement"
  | "general"
  | "rotation"
  | "motion"
  | "grid"
  | "notation"
  | "letterType"
  | "sequence"
  | "execution";

export interface GlossaryEntry {
  definition: string;
  examples: string[];
  relatedTerms: string[];
  category: GlossaryCategory;
  /** Optional field for execution category entries */
  benefit?: string;
  /** Optional field for execution category entries */
  importance?: string;
}
