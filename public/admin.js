const state = {
  accessToken: null,
  currentUser: null,
  tenant: null,
  members: [],
  metadata: { roles: [], permissions: [] },
  editingMemberId: null,
}

const elements = {
  feedback: document.getElementById('admin-feedback'),
  sidebarTenantName: document.getElementById('sidebar-tenant-name'),
  sidebarSessionId: document.getElementById('sidebar-session-id'),
  sidebarOwnerRole: document.getElementById('sidebar-owner-role'),
  backToAppBtn: document.getElementById('back-to-app-btn'),
  logoutBtn: document.getElementById('logout-admin-btn'),
  heroTitle: document.getElementById('hero-title'),
  heroSubtitle: document.getElementById('hero-subtitle'),
  currentUserBadge: document.getElementById('current-user-badge'),
  statsGrid: document.getElementById('stats-grid'),
  membersEmpty: document.getElementById('members-empty'),
  membersList: document.getElementById('members-list'),
  memberForm: document.getElementById('member-form'),
  memberFormTitle: document.getElementById('member-form-title'),
  memberFormMode: document.getElementById('member-form-mode'),
  memberFullName: document.getElementById('member-full-name'),
  memberUsername: document.getElementById('member-username'),
  memberEmail: document.getElementById('member-email'),
  memberPassword: document.getElementById('member-password'),
  memberRole: document.getElementById('member-role'),
  memberStatus: document.getElementById('member-status'),
  memberPermissions: document.getElementById('member-permissions'),
  memberSaveBtn: document.getElementById('member-save-btn'),
  memberCancelBtn: document.getElementById('member-cancel-btn'),
}

function clearAuth() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
}

function formatRole(role) {
  const labels = {
    owner: 'Proprietario',
    admin: 'Administrador',
    collaborator: 'Colaborador',
  }
  return labels[role] || role
}

function formatDate(value) {
  if (!value) return 'Nunca'
  try {
    return new Date(value).toLocaleString('pt-BR')
  } catch (error) {
    return 'Nunca'
  }
}

function getSelectedPermissions() {
  return Array.from(
    elements.memberPermissions.querySelectorAll('input[type="checkbox"]:checked'),
  ).map((input) => input.value)
}

function showFeedback(message, type = 'success') {
  elements.feedback.textContent = message
  elements.feedback.className = `admin-feedback ${type}`
}

function hideFeedback() {
  elements.feedback.className = 'admin-feedback hidden'
  elements.feedback.textContent = ''
}

async function refreshToken() {
  const refreshTokenValue = localStorage.getItem('refreshToken')
  if (!refreshTokenValue) {
    throw new Error('Token de refresh indisponivel')
  }

  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: refreshTokenValue }),
  })

  if (!response.ok) {
    clearAuth()
    throw new Error('Sessao expirada')
  }

  const data = await response.json()
  localStorage.setItem('accessToken', data.tokens.accessToken)
  localStorage.setItem('refreshToken', data.tokens.refreshToken)
  state.accessToken = data.tokens.accessToken
}

async function api(path, options = {}, retry = true) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`
  }

  const response = await fetch(path, {
    ...options,
    headers,
  })

  if (response.status === 401 && retry) {
    await refreshToken()
    return api(path, options, false)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'Falha na requisicao')
  }

  return response.json()
}

async function ensureAuth() {
  state.accessToken = localStorage.getItem('accessToken')
  const refreshTokenValue = localStorage.getItem('refreshToken')

  if (!state.accessToken || !refreshTokenValue) {
    window.location.href = '/auth'
    return
  }

  try {
    const auth = await api('/api/auth/me')
    state.currentUser = auth.user
    state.tenant = auth.tenant
    localStorage.setItem('user', JSON.stringify(auth.user))
  } catch (error) {
    clearAuth()
    window.location.href = '/auth'
  }
}

function renderStats() {
  const members = state.members || []
  const activeCount = members.filter((member) => member.status === 'active').length
  const adminCount = members.filter((member) => member.role === 'admin').length
  const aiManagers = members.filter((member) =>
    Array.isArray(member.permissions) && member.permissions.includes('ai:manage'),
  ).length

  const cards = [
    { label: 'Membros totais', value: String(members.length) },
    { label: 'Membros ativos', value: String(activeCount) },
    { label: 'Admins', value: String(adminCount) },
    { label: 'Operadores de IA', value: String(aiManagers) },
  ]

  elements.statsGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="admin-stat-card">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
        </article>
      `,
    )
    .join('')
}

function renderTenant() {
  const tenant = state.tenant
  if (!tenant) return

  elements.sidebarTenantName.textContent = tenant.name
  elements.sidebarSessionId.textContent = tenant.sessionId
  elements.sidebarOwnerRole.textContent = formatRole(state.currentUser?.role || 'collaborator')
  elements.heroTitle.textContent = tenant.name
  elements.heroSubtitle.textContent = `Slug ${tenant.slug} · Sessao compartilhada ${tenant.sessionId}`
  elements.currentUserBadge.textContent = `${state.currentUser?.fullName || state.currentUser?.username || '-'} · ${formatRole(state.currentUser?.role || 'collaborator')}`
}

function renderRoleOptions(selectedRole) {
  const roles = state.metadata.roles || []
  elements.memberRole.innerHTML = roles
    .map((role) => `<option value="${role.value}">${role.label}</option>`)
    .join('')

  if (!roles.length) {
    elements.memberRole.innerHTML = '<option value="collaborator">Colaborador</option>'
  }

  elements.memberRole.value = selectedRole || roles[0]?.value || 'collaborator'
}

function renderPermissionOptions(selectedPermissions = []) {
  const selected = new Set(selectedPermissions)
  elements.memberPermissions.innerHTML = (state.metadata.permissions || [])
    .map(
      (permission) => `
        <label class="permission-option">
          <input type="checkbox" value="${permission.value}" ${selected.has(permission.value) ? 'checked' : ''} />
          <span class="permission-option-title">${permission.label}</span>
          <small>${permission.description}</small>
        </label>
      `,
    )
    .join('')
}

function getDefaultPermissions(roleValue) {
  return state.metadata.roles.find((role) => role.value === roleValue)?.defaultPermissions || []
}

function resetMemberForm() {
  state.editingMemberId = null
  elements.memberForm.reset()
  elements.memberFormTitle.textContent = 'Criar colaborador'
  elements.memberFormMode.textContent = 'Novo'
  elements.memberFormMode.className = 'admin-badge admin-badge-soft'
  elements.memberPassword.required = true
  elements.memberPassword.placeholder = 'Minimo 6 caracteres'
  const initialRole = state.metadata.roles[0]?.value || 'collaborator'
  renderRoleOptions(initialRole)
  renderPermissionOptions(getDefaultPermissions(initialRole))
}

function renderMembers() {
  const manageableRoles = new Set((state.metadata.roles || []).map((role) => role.value))
  const members = state.members || []

  if (!members.length) {
    elements.membersEmpty.classList.remove('hidden')
    elements.membersList.innerHTML = ''
    return
  }

  elements.membersEmpty.classList.add('hidden')
  elements.membersList.innerHTML = members
    .map((member) => {
      const canEdit = manageableRoles.has(member.role)
      const permissionsPreview = (member.permissions || [])
        .slice(0, 3)
        .map((permission) => `<span class="permission-pill">${permission}</span>`)
        .join('')

      return `
        <article class="member-card">
          <div class="member-card-top">
            <div>
              <h4>${member.fullName || member.username}</h4>
              <p>${member.email}</p>
            </div>
            <div class="member-card-badges">
              <span class="admin-badge ${member.status === 'active' ? 'admin-badge-live' : 'admin-badge-danger'}">${member.status === 'active' ? 'Ativo' : 'Inativo'}</span>
              <span class="admin-badge admin-badge-soft">${member.roleLabel || formatRole(member.role)}</span>
            </div>
          </div>
          <div class="member-card-meta">
            <span>@${member.username}</span>
            <span>Ultimo login: ${formatDate(member.lastLoginAt)}</span>
          </div>
          <div class="member-permissions">${permissionsPreview}</div>
          <div class="member-card-actions">
            ${canEdit ? `<button class="btn-secondary member-edit-btn" data-member-id="${member.id}" type="button">Editar</button>` : '<span class="member-protected-label">Protegido</span>'}
          </div>
        </article>
      `
    })
    .join('')
}

function hydrateMemberForm(member) {
  state.editingMemberId = member.id
  elements.memberFormTitle.textContent = 'Editar colaborador'
  elements.memberFormMode.textContent = 'Edicao'
  elements.memberFormMode.className = 'admin-badge admin-badge-live'
  elements.memberFullName.value = member.fullName || ''
  elements.memberUsername.value = member.username || ''
  elements.memberEmail.value = member.email || ''
  renderRoleOptions(member.role)
  elements.memberRole.value = member.role
  elements.memberStatus.value = member.status || 'active'
  renderPermissionOptions(member.permissions || [])
  elements.memberPassword.required = false
  elements.memberPassword.value = ''
  elements.memberPassword.placeholder = 'Deixe em branco para manter a senha'
}

async function loadOverview() {
  const overview = await api('/api/admin/overview')
  state.members = overview.members || []
  state.metadata = overview.metadata || { roles: [], permissions: [] }

  if (overview.currentUser) {
    state.currentUser = {
      ...state.currentUser,
      ...overview.currentUser,
    }
  }

  if (overview.tenant) {
    state.tenant = overview.tenant
  }

  renderTenant()
  renderStats()
  renderMembers()
  resetMemberForm()
}


async function saveMember(event) {
  event.preventDefault()
  hideFeedback()

  const payload = {
    fullName: elements.memberFullName.value.trim(),
    username: elements.memberUsername.value.trim(),
    email: elements.memberEmail.value.trim(),
    password: elements.memberPassword.value,
    role: elements.memberRole.value,
    status: elements.memberStatus.value,
    permissions: getSelectedPermissions(),
  }

  if (!payload.fullName || !payload.username || !payload.email) {
    showFeedback('Preencha nome, usuario e email do colaborador.', 'error')
    return
  }

  if (!state.editingMemberId && (!payload.password || payload.password.length < 6)) {
    showFeedback('Defina uma senha com pelo menos 6 caracteres.', 'error')
    return
  }

  if (state.editingMemberId && !payload.password) {
    delete payload.password
  }

  try {
    if (state.editingMemberId) {
      await api(`/api/admin/users/${encodeURIComponent(state.editingMemberId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      showFeedback('Colaborador atualizado com sucesso.', 'success')
    } else {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      showFeedback('Colaborador criado com sucesso.', 'success')
    }

    await loadOverview()
  } catch (error) {
    showFeedback(error.message || 'Nao foi possivel salvar o colaborador.', 'error')
  }
}

function bindEvents() {
  elements.backToAppBtn.addEventListener('click', () => {
    window.location.href = '/'
  })

  elements.logoutBtn.addEventListener('click', () => {
    clearAuth()
    window.location.href = '/auth'
  })

  elements.memberCancelBtn.addEventListener('click', () => {
    hideFeedback()
    resetMemberForm()
  })

  elements.memberForm.addEventListener('submit', saveMember)

  elements.memberRole.addEventListener('change', () => {
    if (!state.editingMemberId) {
      renderPermissionOptions(getDefaultPermissions(elements.memberRole.value))
    }
  })

  elements.membersList.addEventListener('click', (event) => {
    const button = event.target.closest('.member-edit-btn')
    if (!button) return

    const memberId = button.getAttribute('data-member-id')
    const member = state.members.find((item) => item.id === memberId)
    if (member) {
      hydrateMemberForm(member)
      hideFeedback()
    }
  })
}

async function boot() {
  bindEvents()
  await ensureAuth()

  try {
    await loadOverview()
  } catch (error) {
    showFeedback(error.message || 'Nao foi possivel carregar o painel.', 'error')
  }
}

boot()
