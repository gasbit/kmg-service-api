export interface AuthenticatedRequestUser {
  id: string;
  name: string;
  username: string;
  role: {
    id: string;
    code: string;
    name: string;
  };
}
