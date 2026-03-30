export interface UserResult {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  friendshipStatus: string;
}

export interface NotebookResult {
  id: string;
  name: string;
  subject: string | null;
  color: string | null;
  description: string | null;
  updatedAt: string;
}

export interface CommunityNotebookResult {
  shareId: string;
  name: string;
  title: string | null;
  subject: string | null;
  ownerUsername: string;
  ownerAvatarUrl: string | null;
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
  communityNotebooks?: CommunityNotebookResult[];
  pages?: PageResult[];
}

export type SearchContext = 'home' | 'notebooks' | 'workspace';
