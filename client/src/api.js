async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  const me = localStorage.getItem('rks-user-id')
  if (me) headers['X-User-Id'] = me
  let payload
  if (form) payload = form
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const response = await fetch(path, { method, headers, body: payload })
  if (response.status === 204) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Ошибка запроса')
  return data
}

export const api = {
  meta: () => request('/api/meta'),
  issues: (scope) => request(`/api/issues?scope=${encodeURIComponent(scope)}`),
  issue: (id) => request(`/api/issues/${id}`),
  createIssue: (body) => request('/api/issues', { method: 'POST', body }),
  patchIssue: (id, body) => request(`/api/issues/${id}`, { method: 'PATCH', body }),
  deleteIssue: (id) => request(`/api/issues/${id}`, { method: 'DELETE' }),
  reorder: (body) => request('/api/issues/reorder', { method: 'POST', body }),
  createLabel: (name) => request('/api/labels', { method: 'POST', body: { name } }),
  checklist: (id, title) => request(`/api/issues/${id}/checklist`, { method: 'POST', body: { title } }),
  patchChecklist: (id, body) => request(`/api/checklist/${id}`, { method: 'PATCH', body }),
  deleteChecklist: (id) => request(`/api/checklist/${id}`, { method: 'DELETE' }),
  comment: (id, text) => request(`/api/issues/${id}/comments`, { method: 'POST', body: { body: text } }),
  deleteComment: (id) => request(`/api/comments/${id}`, { method: 'DELETE' }),
  upload: (id, file) => {
    const form = new FormData()
    form.append('file', file)
    return request(`/api/issues/${id}/attachments`, { method: 'POST', form })
  },
  deleteFile: (id) => request(`/api/attachments/${id}`, { method: 'DELETE' }),
  logTime: (id, body) => request(`/api/issues/${id}/time`, { method: 'POST', body }),
  deleteTime: (id) => request(`/api/time/${id}`, { method: 'DELETE' }),
  createUser: (body) => request('/api/users', { method: 'POST', body }),
  createSprint: (body) => request('/api/sprints', { method: 'POST', body }),
  patchSprint: (id, body) => request(`/api/sprints/${id}`, { method: 'PATCH', body }),
  startSprint: (id) => request(`/api/sprints/${id}/start`, { method: 'POST' }),
  closeSprint: (id) => request(`/api/sprints/${id}/close`, { method: 'POST' }),
  deleteSprint: (id) => request(`/api/sprints/${id}`, { method: 'DELETE' }),
}
