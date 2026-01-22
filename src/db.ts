import mysql from 'mysql2/promise'

let pool: any = null

export function initDB(config: any) {
  if (!pool) {
    pool = mysql.createPool({
      host: config.host,
      port: parseInt(config.port || '3306'),
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    })
  }
  return pool
}

export function getDB() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDB() first.')
  }
  return pool
}

export default { initDB, getDB }
