export interface Task {
  id: string;
  name: string;
  status?: string;
  due?: string;
  url: string;
}

export interface CreateTaskInput {
  name: string;
  due?: string;
}
