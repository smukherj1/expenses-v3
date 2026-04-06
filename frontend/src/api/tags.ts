import { get, post, del } from "./client.ts";

export interface Tag {
  id: string;
  name: string;
}

export function getTags(): Promise<Tag[]> {
  return get<Tag[]>("/tags");
}

export function createTag(name: string): Promise<Tag> {
  return post<Tag>("/tags", { name });
}

export function deleteTag(id: string): Promise<void> {
  return del<void>(`/tags/${id}`);
}
