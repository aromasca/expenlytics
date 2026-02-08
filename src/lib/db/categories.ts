import type Database from 'better-sqlite3'

export interface Category {
  id: number
  name: string
  color: string
  category_group: string
}

export function getAllCategories(db: Database.Database): Category[] {
  return db.prepare('SELECT id, name, color, category_group FROM categories ORDER BY name').all() as Category[]
}
