export interface User {
  id: string;
  nickname: string;
  email: string;
  role:string;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResult {
  access_token: string;
  user: Omit<User, 'createdAt' | 'updatedAt'>
}