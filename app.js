class WinstreakDApp {
    constructor() {
        this.web3 = null;
        this.contract = null;
        this.account = null;
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
            }
        ];
        
        this.init();
    }

    async init() {
        // Check if Web3 is injected
        if (typeof window.ethereum !== 'undefined') {
            this.web3 = new Web3(window.ethereum);
            await this.initContract();
            this.setupEventListeners();
            this.checkConnection();
        } else {
            this.showError('لطفاً یک ولت مانند MetaMask نصب کنید');
        }
    }

    async initContract() {
        try {
            this.contract = new this.web3.eth.Contract(this.contractABI, this.contractAddress);
            console.log('Contract initialized');
        } catch (error) {
            console.error('Error initializing contract:', error);
            this.showError('خطا در اتصال به قرارداد');
        }
    }

    setupEventListeners() {
        document.getElementById('connectWalletBtn').addEventListener('click', () => this.connectWallet());
        document.getElementById('buyTicketBtn').addEventListener('click', () => this.buyTicket());
        document.getElementById('ticketCount').addEventListener('input', () => this.calculateTotal());
        
        // Listen for account changes
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length > 0) {
                    this.account = accounts[0];
                    this.onAccountConnected();
                } else {
                    this.onAccountDisconnected();
                }
            });
            
            window.ethereum.on('chainChanged', (chainId) => {
                window.location.reload();
            });
        }
    }

    async checkConnection() {
        try {
            const accounts = await this.web3.eth.getAccounts();
            if (accounts.length > 0) {
                this.account = accounts[0];
                await this.onAccountConnected();
            }
        } catch (error) {
            console.error('Error checking connection:', error);
        }
    }

    async connectWallet() {
        try {
            this.showLoading('connectWalletBtn', 'در حال اتصال...');
            
            // Request account access
            const accounts = await window.ethereum.request({ 
                method: 'eth_requestAccounts' 
            });
            
            this.account = accounts[0];
            await this.onAccountConnected();
            
            this.hideLoading('connectWalletBtn', 'اتصال ولت');
            this.showSuccess('ولت با موفقیت متصل شد');
            
        } catch (error) {
            console.error('Error connecting wallet:', error);
            this.hideLoading('connectWalletBtn', 'اتصال ولت');
            
            if (error.code === 4001) {
                this.showError('اتصال ولت رد شد');
            } else {
                this.showError('خطا در اتصال ولت');
            }
        }
    }

    async onAccountConnected() {
        // Update UI
        document.getElementById('connectWalletBtn').style.display = 'none';
        document.getElementById('purchaseSection').style.display = 'block';
        
        // Update account info
        document.getElementById('accountValue').textContent = 
            this.account.substring(0, 6) + '...' + this.account.substring(38);
        
        // Get network info
        const chainId = await this.web3.eth.getChainId();
        await this.updateNetworkInfo(chainId);
        
        // Get balance
        await this.updateBalance();
        
        // Get ticket price
        await this.updateTicketPrice();
    }

    onAccountDisconnected() {
        document.getElementById('connectWalletBtn').style.display = 'block';
        document.getElementById('purchaseSection').style.display = 'none';
        document.getElementById('accountValue').textContent = '--';
        document.getElementById('balanceValue').textContent = '--';
    }

    async updateNetworkInfo(chainId) {
        const networkInfo = {
            '0x1': 'Ethereum Mainnet',
            '0x89': 'Polygon Mainnet',
            '0x13881': 'Polygon Mumbai',
            '0x38': 'BSC Mainnet',
            '0x61': 'BSC Testnet'
        };
        
        const networkName = networkInfo[chainId] || `Unknown (${chainId})`;
        document.getElementById('networkValue').textContent = networkName;
        
        // Check if on Polygon
        if (chainId !== '0x89' && chainId !== '0x13881') {
            this.showError('لطفاً به شبکه Polygon متصل شوید');
        }
    }

    async updateBalance() {
        try {
            const balance = await this.web3.eth.getBalance(this.account);
            const balanceInMatic = this.web3.utils.fromWei(balance, 'ether');
            document.getElementById('balanceValue').textContent = 
                parseFloat(balanceInMatic).toFixed(4) + ' MATIC';
        } catch (error) {
            console.error('Error getting balance:', error);
        }
    }

    async updateTicketPrice() {
        try {
            const price = await this.contract.methods.ticketPrice().call();
            const priceInMatic = this.web3.utils.fromWei(price, 'ether');
            this.ticketPrice = price;
            document.getElementById('ticketPrice').textContent = 
                parseFloat(priceInMatic).toFixed(4) + ' MATIC';
            
            this.calculateTotal();
        } catch (error) {
            console.error('Error getting ticket price:', error);
        }
    }

    calculateTotal() {
        if (!this.ticketPrice) return;
        
        const ticketCount = parseInt(document.getElementById('ticketCount').value) || 1;
        const totalWei = BigInt(this.ticketPrice) * BigInt(ticketCount);
        const totalMatic = this.web3.utils.fromWei(totalWei.toString(), 'ether');
        
        document.getElementById('totalAmount').textContent = 
            parseFloat(totalMatic).toFixed(4) + ' MATIC';
    }

    async buyTicket() {
        try {
            const ticketCount = parseInt(document.getElementById('ticketCount').value) || 1;
            const totalWei = BigInt(this.ticketPrice) * BigInt(ticketCount);
            
            this.showLoading('buyTicketBtn', 'در حال پردازش...');
            
            const transaction = await this.contract.methods.buyTicket(ticketCount)
                .send({
                    from: this.account,
                    value: totalWei.toString(),
                    gas: 200000
                });
            
            this.hideLoading('buyTicketBtn', 'خرید بلیط');
            this.showSuccess(`خرید ${ticketCount} بلیط با موفقیت انجام شد!`);
            
            // Update balance
            await this.updateBalance();
            
        } catch (error) {
            console.error('Error buying ticket:', error);
            this.hideLoading('buyTicketBtn', 'خرید بلیط');
            
            if (error.code === 4001) {
                this.showError('تراکنش توسط کاربر رد شد');
            } else {
                this.showError('خطا در خرید بلیط');
            }
        }
    }

    showLoading(buttonId, text) {
        const button = document.getElementById(buttonId);
        const originalText = button.querySelector('span').textContent;
        button.disabled = true;
        button.innerHTML = `<div class="loader"></div>${text}`;
        button.dataset.originalText = originalText;
    }

    hideLoading(buttonId, text) {
        const button = document.getElementById(buttonId);
        button.disabled = false;
        button.innerHTML = `<span>${text}</span>`;
    }

    showMessage(message, type) {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
        
        setTimeout(() => {
            statusDiv.innerHTML = '';
        }, 5000);
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showInfo(message) {
        this.showMessage(message, 'info');
    }
}

// Language switching
function switchLanguage(lang) {
    const elements = document.querySelectorAll('.lang-btn');
    elements.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    const translations = {
        fa: {
            title: 'ثبت‌نام در Winstreak',
            subtitle: 'لطفاً ولت خود را متصل کرده و بلیط خریداری کنید',
            networkLabel: 'شبکه:',
            accountLabel: 'حساب:',
            balanceLabel: 'موجودی:',
            priceLabel: 'قیمت بلیط:',
            totalLabel: 'مبلغ کل:',
            connectText: 'اتصال ولت',
            buyText: 'خرید بلیط',
            supportText: 'پشتیبانی از: MetaMask, Trust Wallet, SafePal و سایر ولت‌های سازگار'
        },
        en: {
            title: 'Register in Winstreak',
            subtitle: 'Please connect your wallet and purchase tickets',
            networkLabel: 'Network:',
            accountLabel: 'Account:',
            balanceLabel: 'Balance:',
            priceLabel: 'Ticket Price:',
            totalLabel: 'Total Amount:',
            connectText: 'Connect Wallet',
            buyText: 'Buy Ticket',
            supportText: 'Supports: MetaMask, Trust Wallet, SafePal and other compatible wallets'
        }
    };

    const trans = translations[lang];
    for (const [key, value] of Object.entries(trans)) {
        const element = document.getElementById(key);
        if (element) {
            element.textContent = value;
        }
    }
}

// Initialize the DApp when page loads
window.addEventListener('load', () => {
    new WinstreakDApp();
});