export interface Project {
    id: string;
    name: string;
    description: string | null;
    gitUrl: string | null;
    ownerId: string;
    createdAt: string;
    updatedAt: string;
}