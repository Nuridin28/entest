export interface AuthUser {
    id: string;
    email: string;
    name: string;
    is_superuser: boolean;
}
export interface LoginCredentials {
    email: string;
    password: string;
}
export interface RegisterData {
    email: string;
    password: string;
    name: string;
}
