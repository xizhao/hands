export interface SqlClient {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>
  unsafe: (query: string) => Promise<unknown[]>
}

export function sql(connectionString?: string): SqlClient {
  // TODO: Implement actual postgres connection using postgres.js or similar
  const client: SqlClient = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((acc, str, i) => {
        return acc + str + (values[i] !== undefined ? `$${i + 1}` : "")
      }, "")
      console.log("SQL:", query, values)
      return Promise.resolve([])
    },
    {
      unsafe: (query: string) => {
        console.log("SQL (unsafe):", query)
        return Promise.resolve([])
      },
    }
  )

  return client
}
