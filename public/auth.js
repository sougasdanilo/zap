class AuthManager {
  constructor() {
    this.initializeElements()
    this.bindEvents()
    this.checkExistingAuth()
  }

  initializeElements() {
    this.loginForm = document.getElementById('login-form')
    this.registerForm = document.getElementById('register-form')
    this.loginFormElement = document.getElementById('login-form-element')
    this.registerFormElement = document.getElementById('register-form-element')
    this.showLoginBtn = document.getElementById('show-login')
    this.showRegisterBtn = document.getElementById('show-register')
    this.loading = document.getElementById('auth-loading')
    this.error = document.getElementById('auth-error')
    this.success = document.getElementById('auth-success')
  }

  bindEvents() {
    this.loginFormElement.addEventListener('submit', (e) => this.handleLogin(e))
    this.registerFormElement.addEventListener('submit', (e) => this.handleRegister(e))
    this.showLoginBtn.addEventListener('click', (e) => this.showLoginForm(e))
    this.showRegisterBtn.addEventListener('click', (e) => this.showRegisterForm(e))
  }

  showLoginForm(e) {
    e.preventDefault()
    this.loginForm.classList.remove('hidden')
    this.registerForm.classList.add('hidden')
    this.clearMessages()
  }

  showRegisterForm(e) {
    e.preventDefault()
    this.loginForm.classList.add('hidden')
    this.registerForm.classList.remove('hidden')
    this.clearMessages()
  }

  async handleLogin(e) {
    e.preventDefault()
    
    const email = document.getElementById('login-email').value
    const password = document.getElementById('login-password').value

    if (!email || !password) {
      this.showError('Preencha todos os campos')
      return
    }

    this.showLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao fazer login')
      }

      localStorage.setItem('accessToken', data.tokens.accessToken)
      localStorage.setItem('refreshToken', data.tokens.refreshToken)
      localStorage.setItem('user', JSON.stringify(data.user))

      this.showSuccess('Login realizado com sucesso!')

      setTimeout(() => {
        window.location.href = '/'
      }, 1500)

    } catch (error) {
      this.showError(error.message)
    } finally {
      this.showLoading(false)
    }
  }

  async handleRegister(e) {
    e.preventDefault()
    
    const username = document.getElementById('register-username').value
    const email = document.getElementById('register-email').value
    const password = document.getElementById('register-password').value
    const confirmPassword = document.getElementById('register-confirm-password').value

    if (!username || !email || !password || !confirmPassword) {
      this.showError('Preencha todos os campos')
      return
    }

    if (password !== confirmPassword) {
      this.showError('As senhas não coincidem')
      return
    }

    if (password.length < 6) {
      this.showError('A senha deve ter pelo menos 6 caracteres')
      return
    }

    this.showLoading(true)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, email, password })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar conta')
      }

      localStorage.setItem('accessToken', data.tokens.accessToken)
      localStorage.setItem('refreshToken', data.tokens.refreshToken)
      localStorage.setItem('user', JSON.stringify(data.user))

      this.showSuccess('Conta criada com sucesso!')

      setTimeout(() => {
        window.location.href = '/'
      }, 1500)

    } catch (error) {
      this.showError(error.message)
    } finally {
      this.showLoading(false)
    }
  }

  async checkExistingAuth() {
    const accessToken = localStorage.getItem('accessToken')
    const refreshToken = localStorage.getItem('refreshToken')

    if (accessToken && refreshToken) {
      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        })

        if (response.ok) {
          window.location.href = '/'
          return
        }

        if (response.status === 401) {
          await this.refreshToken()
          window.location.href = '/'
          return
        }
      } catch (error) {
        console.error('Erro ao verificar autenticação:', error)
      }
    }
  }

  async refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken')
    
    if (!refreshToken) {
      this.clearAuth()
      return
    }

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      })

      if (!response.ok) {
        throw new Error('Token inválido')
      }

      const data = await response.json()
      localStorage.setItem('accessToken', data.tokens.accessToken)
      localStorage.setItem('refreshToken', data.tokens.refreshToken)

    } catch (error) {
      this.clearAuth()
    }
  }

  clearAuth() {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
  }

  showLoading(show) {
    if (show) {
      this.loading.classList.remove('hidden')
      this.error.classList.add('hidden')
      this.success.classList.add('hidden')
    } else {
      this.loading.classList.add('hidden')
    }
  }

  showError(message) {
    this.error.textContent = message
    this.error.classList.remove('hidden')
    this.success.classList.add('hidden')
    this.loading.classList.add('hidden')
  }

  showSuccess(message) {
    this.success.textContent = message
    this.success.classList.remove('hidden')
    this.error.classList.add('hidden')
    this.loading.classList.add('hidden')
  }

  clearMessages() {
    this.error.classList.add('hidden')
    this.success.classList.add('hidden')
  }
}

new AuthManager()
