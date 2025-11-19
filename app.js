class WinstreakDApp {
    constructor() {
        this.web3 = null;
        this.contract = null;
        this.account = null;
        this.provider = null;
        this.web3Modal = null;
        this.connected = false;
        
        // Contract details
        this.contractAddress = '0xdFC970De4C016AB950F965e5364048C16468e2Ec';
        this.contractABI = [
            {
                "inputs": [{"internalType":"uint256","name":"ticketCount","type":"uint256"}],
                "name": "buyTicket",
                "outputs": [],
                "stateMutability": "payable",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "ticketPrice",
                "outputs": [{"internalType":"uint128","name":"","type":"uint128"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "getSystemOverview",
                "outputs": [
                    {"internalType":"uint256","name":"totalTickets","type":"uint256"},
                    {"internalType":"uint256","name":"totalPrizes","type":"uint256"},
                    {"internalType":"uint256","name":"contractBalance","type":"uint256"},
                    {"internalType":"uint256","name":"activePools","type":"uint256"},
                    {"internalType":"uint256","name":"currentTicketPrice","type":"uint256"}
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [{"internalType":"address","name":"user","type":"address"}],
                "name": "getUserCurrentTickets",
                "outputs": [
                    {"internalType":"uint32","name":"pool1Tickets","type":"uint32"},
                    {"internalType":"uint32","name":"pool2Tickets","type":"uint32"},
                    {"internalType":"uint32","name":"pool3Tickets","type":"uint32"}
                ],
                "stateMutability": "view",
                "type": "function"
            }
        ];

        this.transactionHistory = [];
        this.init();
    }

    async init() {
        try {
            await this.initWeb3Modal();
            this.setupEventListeners();
            await this.checkCachedConnection();
            this.setupNetworkListeners();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('خطا در راه‌اندازی برنامه');
        }
    }

    async initWeb3Modal() {
        const providerOptions = {
            walletconnect: {
                package: WalletConnectProvider,
                options: {
                    rpc: {
                        137: 'https://polygon-rpc.com/',
                        80001: 'https://rpc-mumbai.maticvigil.com/'
                    },
                    chainId: 137,
                    qrcodeModalOptions: {
                        mobileLinks: [
                            'metamask',
                            'trust',
                            'safepal',
                            'coinbase',
                            'binance'
                        ]
                    }
                }
            },
            binancechainwallet: {
                package: true
            },
            coinbasewallet: {
                package: true
            }
        };

        this.web3Modal = new Web3Modal({
            network: "polygon",
            cacheProvider: true,
            providerOptions,
            theme: {
                background: "rgba(255,255,255,0.95)",
                main: "rgb(102, 126, 234)",
                secondary: "rgb(118, 75, 162)",
                border: "rgba(229, 231, 235, 1)",
                hover: "rgb(249, 250, 251)"
            }
        });

        console.log('Web3Modal initialized');
    }

    setupEventListeners() {
        document.getElementById('connectWalletBtn').addEventListener('click', () => this.connectWallet());
        document.getElementById('buyTicketBtn').addEventListener('click', () => this.buyTicket());
        document.getElementById('disconnectWalletBtn').addEventListener('click', () => this.disconnectWallet());
        document.getElementById('ticketCount').addEventListener('input', () => this.calculateTotal());
        
        // Keyboard events
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && this.connected) {
                this.buyTicket();
            }
        });
    }

    setupNetworkListeners() {
        // Listen for online/offline status
        window.addEventListener('online', () => this.updateNetworkStatus());
        window.addEventListener('offline', () => this.updateNetworkStatus());
        
        // Periodic balance update
        setInterval(() => {
            if (this.connected) {
                this.updateBalance();
            }
        }, 30000);
    }

    async checkCachedConnection() {
        if (this.web3Modal.cachedProvider) {
            try {
                this.showLoading('connectWalletBtn', 'اتصال خودکار...');
                await this.connectWallet();
            } catch (error) {
                console.error('Cached connection failed:', error);
                this.web3Modal.clearCachedProvider();
                this.hideLoading('connectWalletBtn', 'اتصال کیف پول');
            }
        }
    }

    async connectWallet() {
        try {
            this.showLoading('connectWalletBtn', 'در حال اتصال...');

            this.provider = await this.web3Modal.connect();
            this.web3 = new Web3(this.provider);
            
            await this.initContract();
            
            const accounts = await this.web3.eth.getAccounts();
            if (accounts.length === 0) {
                throw new Error('هیچ حسابی یافت نشد');
            }
            
            this.account = accounts[0];
            await this.onAccountConnected();
            
            this.setupProviderListeners();
            
        } catch (error) {
            console.error('Connection error:', error);
            this.hideLoading('connectWalletBtn', 'اتصال کیف پول');
            
            if (error.code === 4001) {
                this.showError('اتصال توسط کاربر لغو شد');
            } else if (error.code === -32002) {
                this.showWarning('درخواست اتصال در حال انجام است');
            } else {
                this.showError('خطا در اتصال به کیف پول: ' + error.message);
            }
        }
    }

    setupProviderListeners() {
        if (!this.provider) return;

        this.provider.on("accountsChanged", (accounts) => {
            console.log('Accounts changed:', accounts);
            if (accounts.length > 0) {
                this.account = accounts[0];
                this.onAccountConnected();
                this.showSuccess('حساب کیف پول تغییر کرد');
            } else {
                this.onAccountDisconnected();
            }
        });

        this.provider.on("chainChanged", (chainId) => {
            console.log('Chain changed:', chainId);
            window.location.reload();
        });

        this.provider.on("disconnect", (error) => {
            console.log('Provider disconnected:', error);
            this.onAccountDisconnected();
        });

        this.provider.on("connect", (info) => {
            console.log('Provider connected:', info);
        });
    }

    async initContract() {
        try {
            this.contract = new this.web3.eth.Contract(this.contractABI, this.contractAddress);
            console.log('Contract initialized successfully');
        } catch (error) {
            console.error('Contract initialization error:', error);
            throw new Error('خطا در اتصال به قرارداد هوشمند');
        }
    }

    async onAccountConnected() {
        this.connected = true;
        
        // Update UI
        document.getElementById('connectWalletBtn').style.display = 'none';
        document.getElementById('purchaseSection').style.display = 'block';
        document.getElementById('transactionSection').style.display = 'block';
        
        // Update account info
        this.updateAccountDisplay();
        
        // Load all data
        await this.loadAllData();
        
        this.hideLoading('connectWalletBtn', 'اتصال کیف پول');
        this.showSuccess('اتصال با موفقیت برقرار شد');
        
        this.updateNetworkStatus();
    }

    onAccountDisconnected() {
        this.connected = false;
        this.account = null;
        this.provider = null;
        
        // Update UI
        document.getElementById('connectWalletBtn').style.display = 'block';
        document.getElementById('purchaseSection').style.display = 'none';
        document.getElementById('transactionSection').style.display = 'none';
        
        document.getElementById('accountValue').textContent = '--';
        document.getElementById('balanceValue').textContent = '--';
        document.getElementById('networkValue').textContent = '--';
        document.getElementById('networkIndicator').className = 'network-indicator network-disconnected';
        document.getElementById('networkIndicator').textContent = 'قطع';
        
        this.web3Modal.clearCachedProvider();
        this.showInfo('اتصال کیف پول قطع شد');
    }

    async disconnectWallet() {
        try {
            if (this.provider && this.provider.disconnect) {
                await this.provider.disconnect();
            }
            this.onAccountDisconnected();
        } catch (error) {
            console.error('Disconnect error:', error);
            this.onAccountDisconnected();
        }
    }

    updateAccountDisplay() {
        if (this.account) {
            const formattedAddress = `${this.account.substring(0, 8)}...${this.account.substring(38)}`;
            document.getElementById('accountValue').textContent = formattedAddress;
        }
    }

    async loadAllData() {
        try {
            await Promise.all([
                this.updateNetworkInfo(),
                this.updateBalance(),
                this.updateTicketPrice(),
                this.updateUserTickets()
            ]);
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('خطا در بارگذاری اطلاعات');
        }
    }

    async updateNetworkInfo() {
        try {
            const chainId = await this.web3.eth.getChainId();
            const networkInfo = {
                '0x1': 'اتریوم',
                '0x89': 'Polygon',
                '0x13881': 'Polygon Mumbai',
                '0x38': 'BSC',
                '0x61': 'BSC Testnet'
            };
            
            const networkName = networkInfo[chainId] || `شبکه نامشخص (${chainId})`;
            document.getElementById('networkValue').textContent = networkName;
            
            // Update network indicator
            const indicator = document.getElementById('networkIndicator');
            if (chainId === '0x89' || chainId === '0x13881') {
                indicator.className = 'network-indicator network-connected';
                indicator.textContent = 'متصل';
            } else {
                indicator.className = 'network-indicator network-disconnected';
                indicator.textContent = 'شبکه نادرست';
                this.showWarning('لطفاً به شبکه Polygon متصل شوید');
            }
            
        } catch (error) {
            console.error('Network info error:', error);
        }
    }

    async updateBalance() {
        try {
            const balance = await this.web3.eth.getBalance(this.account);
            const balanceInMatic = this.web3.utils.fromWei(balance, 'ether');
            document.getElementById('balanceValue').textContent = 
                parseFloat(balanceInMatic).toFixed(4) + ' MATIC';
        } catch (error) {
            console.error('Balance update error:', error);
        }
    }

    async updateTicketPrice() {
        try {
            const price = await this.contract.methods.ticketPrice().call();
            const priceInMatic = this.web3.utils.fromWei(price, 'ether');
            this.ticketPrice = price;
            document.getElementById('ticketPrice').textContent = 
                parseFloat(priceInMatic).toFixed(6) + ' MATIC';
            
            this.calculateTotal();
        } catch (error) {
            console.error('Ticket price error:', error);
            this.showError('خطا در دریافت قیمت بلیط');
        }
    }

    async updateUserTickets() {
        try {
            const tickets = await this.contract.methods.getUserCurrentTickets(this.account).call();
            // You can display this information in the UI if needed
            console.log('User tickets:', tickets);
        } catch (error) {
            console.error('User tickets error:', error);
        }
    }

    calculateTotal() {
        if (!this.ticketPrice) return;
        
        const ticketCount = parseInt(document.getElementById('ticketCount').value) || 1;
        const totalWei = BigInt(this.ticketPrice) * BigInt(ticketCount);
        const totalMatic = this.web3.utils.fromWei(totalWei.toString(), 'ether');
        
        document.getElementById('totalAmount').textContent = 
            parseFloat(totalMatic).toFixed(6) + ' MATIC';
    }

    async buyTicket() {
        try {
            const ticketCount = parseInt(document.getElementById('ticketCount').value) || 1;
            
            if (ticketCount < 1 || ticketCount > 20) {
                this.showError('تعداد بلیط باید بین ۱ تا ۲۰ باشد');
                return;
            }
            
            const totalWei = BigInt(this.ticketPrice) * BigInt(ticketCount);
            const totalMatic = this.web3.utils.fromWei(totalWei.toString(), 'ether');
            
            // Check balance
            const balance = await this.web3.eth.getBalance(this.account);
            if (BigInt(balance) < totalWei) {
                this.showError('موجودی کافی نیست');
                return;
            }
            
            this.showLoading('buyTicketBtn', 'در حال پردازش...');
            
            const transaction = this.contract.methods.buyTicket(ticketCount);
            const gasEstimate = await transaction.estimateGas({
                from: this.account,
                value: totalWei.toString()
            });
            
            const tx = await transaction.send({
                from: this.account,
                value: totalWei.toString(),
                gas: Math.min(Number(gasEstimate) * 2, 300000) // Safe gas limit
            });
            
            // Add to transaction history
            this.addTransactionToHistory(tx.transactionHash, ticketCount, totalMatic);
            
            this.hideLoading('buyTicketBtn', 'خرید بلیط و ثبت‌نام');
            this.showSuccess(`خرید ${ticketCount} بلیط با موفقیت انجام شد!`);
            
            // Update data
            await this.updateBalance();
            await this.updateUserTickets();
            
        } catch (error) {
            console.error('Buy ticket error:', error);
            this.hideLoading('buyTicketBtn', 'خرید بلیط و ثبت‌نام');
            
            if (error.code === 4001) {
                this.showError('تراکنش توسط کاربر لغو شد');
            } else if (error.message.includes('insufficient funds')) {
                this.showError('موجودی کافی نیست');
            } else {
                this.showError('خطا در خرید بلیط: ' + error.message);
            }
        }
    }

    addTransactionToHistory(txHash, ticketCount, amount) {
        const transaction = {
            hash: txHash,
            tickets: ticketCount,
            amount: amount,
            timestamp: new Date().toLocaleString('fa-IR'),
            status: 'موفق'
        };
        
        this.transactionHistory.unshift(transaction);
        this.updateTransactionDisplay();
    }

    updateTransactionDisplay() {
        const container = document.getElementById('transactionHistory');
        if (this.transactionHistory.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">تراکنشی یافت نشد</p>';
            return;
        }
        
        container.innerHTML = this.transactionHistory.slice(0, 5).map(tx => `
            <div style="border-bottom: 1px solid #f1f5f9; padding: 12px 0;">
                <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: #1f2937;">${tx.tickets} بلیط</span>
                    <span style="color: #10b981; font-size: 12px;">${tx.status}</span>
                </div>
                <div style="display: flex; justify-content: between; align-items: center; font-size: 12px; color: #6b7280;">
                    <span>${tx.amount} MATIC</span>
                    <span>${tx.timestamp}</span>
                </div>
                <div style="font-size: 10px; color: #9ca3af; margin-top: 4px; direction: ltr; text-align: left;">
                    ${tx.hash.substring(0, 20)}...
                </div>
            </div>
        `).join('');
    }

    updateNetworkStatus() {
        const indicator = document.getElementById('networkIndicator');
        if (!navigator.onLine) {
            indicator.className = 'network-indicator network-disconnected';
            indicator.textContent = 'آفلاین';
            this.showWarning('اتصال اینترنت قطع شده است');
        }
    }

    // UI Helper Methods
    showLoading(buttonId, text) {
        const button = document.getElementById(buttonId);
        button.disabled = true;
        button.innerHTML = `<div class="loader"></div>${text}`;
    }

    hideLoading(buttonId, text) {
        const button = document.getElementById(buttonId);
        button.disabled = false;
        button.innerHTML = text;
    }

    showMessage(message, type) {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
        
        setTimeout(() => {
            if (statusDiv.innerHTML.includes(message)) {
                statusDiv.innerHTML = '';
            }
        }, type === 'error' ? 8000 : 5000);
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showWarning(message) {
        this.showMessage(message, 'warning');
    }

    showInfo(message) {
        this.showMessage(message, 'info');
    }
}

// Language management
function switchLanguage(lang) {
    const elements = document.querySelectorAll('.lang-btn');
    elements.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    const translations = {
        fa: {
            title: 'ثبت‌نام در Winstreak',
            subtitle: 'لطفاً ولت خود را متصل کرده و بلیط خریداری کنید',
            networkLabel: 'وضعیت شبکه:',
            accountLabel: 'آدرس کیف پول:',
            balanceLabel: 'موجودی:',
            priceLabel: 'قیمت هر بلیط:',
            countLabel: 'تعداد بلیط',
            totalLabel: 'مبلغ قابل پرداخت:',
            connectText: 'اتصال کیف پول',
            buyText: 'خرید بلیط و ثبت‌نام',
            disconnectText: 'قطع اتصال کیف پول',
            supportText: 'پشتیبانی از تمام کیف پول‌ها: MetaMask, Trust Wallet, SafePal, WalletConnect, Coinbase Wallet و سایر ولت‌های سازگار',
            historyTitle: 'تاریخچه تراکنش‌ها'
        },
        en: {
            title: 'Register in Winstreak',
            subtitle: 'Please connect your wallet and purchase tickets',
            networkLabel: 'Network Status:',
            accountLabel: 'Wallet Address:',
            balanceLabel: 'Balance:',
            priceLabel: 'Ticket Price:',
            countLabel: 'Number of Tickets',
            totalLabel: 'Total Amount:',
            connectText: 'Connect Wallet',
            buyText: 'Buy Ticket & Register',
            disconnectText: 'Disconnect Wallet',
            supportText: 'Supports all wallets: MetaMask, Trust Wallet, SafePal, WalletConnect, Coinbase Wallet and other compatible wallets',
            historyTitle: 'Transaction History'
        }
    };

    const trans = translations[lang];
    for (const [key, value] of Object.entries(trans)) {
        const element = document.getElementById(key);
        if (element) {
            element.textContent = value;
        }
    }

    // Update direction
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
}

// Initialize the DApp when page loads
window.addEventListener('load', () => {
    window.winstreakDApp = new WinstreakDApp();
});

// Service Worker for PWA (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('SW registered'))
            .catch(error => console.log('SW registration failed'));
    });
}