export interface UserResult {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  friendshipStatus: string;
  // Cosmetic styling — carried through so search rows render with the
  // same font/color/title/frame as every other username surface.
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedTitleId?: string | null;
  equippedFrameId?: string | null;
}

export interface NotebookResult {
  id: string;
  name: string;
  subject: string | null;
  color: string | null;
  description: string | null;
  updatedAt: string;
}

export interface PageResult {
  id: string;
  title: string;
  sectionTitle: string;
  notebookId: string;
  notebookName: string;
  textSnippet: string;
}

export interface SearchResults {
  users?: UserResult[];
  notebooks?: NotebookResult[];
  pages?: PageResult[];
}

export type SearchContext = 'home' | 'notebooks' | 'workspace';
