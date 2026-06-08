import './assets/index.css'
import { createApp } from 'vue'
import SolanaWallets from 'solana-wallets-vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(router)
// Auto-detects Wallet Standard wallets (Phantom, Solflare, Backpack, …).
app.use(SolanaWallets, { autoConnect: true })

app.mount('#app')
