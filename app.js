class LotteryDApp {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.userAddress = null;
        this.walletConnectProvider = null;
        this.connectionType = null; // 'metamask' یا 'walletconnect'
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('connect-metamask').addEventListener('click', () => this.connectMetaMask());
        document.getElementById('connect-walletconnect').addEventListener('click', () => this.connectWalletConnect());
        document.getElementById('disconnect-wallet').addEventListener('click', () => this.disconnectWallet());
        document.getElementById('buy-ticket').addEventListener('click', () => this.buyTicket());
        document.getElementById('ticket-count').addEventListener('input', (e) => this.updateTotalPrice(e.target.value));
        
        // مدیریت modal QR code
        document.querySelector('.close').addEventListener('click', () => this.hideQRModal());
        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('qr-modal')) {
                this.hideQRModal();
            }
        });
    }

    async connectMetaMask() {
        try {
            if (typeof window.ethereum === 'undefined') {
                alert('لطفا MetaMask را نصب کنید!');
                return;
            }

            await window.ethereum.request({ method: 'eth_requestAccounts' });
            
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();
            this.userAddress = await this.signer.getAddress();
            this.connectionType = 'metamask';

            await this.initializeContract();
            this.updateUI();

        } catch (error) {
            console.error('خطا در اتصال به MetaMask:', error);
            alert('خطا در اتصال به MetaMask: ' + error.message);
        }
    }

    async connectWalletConnect() {
        try {
            // ایجاد WalletConnect Provider
            this.walletConnectProvider = new WalletConnectProvider.default({
                bridge: WALLETCONNECT_CONFIG.bridge,
                rpc: WALLETCONNECT_CONFIG.rpc,
                chainId: 137 // Polygon Mainnet
            });

            // نمایش QR Code
            await this.showQRModal();

            // اتصال
            await this.walletConnectProvider.enable();
            
            this.hideQRModal();

            this.provider = new ethers.providers.Web3Provider(this.walletConnectProvider);
            this.signer = this.provider.getSigner();
            this.userAddress = await this.signer.getAddress();
            this.connectionType = 'walletconnect';

            await this.initializeContract();
            this.updateUI();

            // گوش دادن به events قطع ارتباط
            this.walletConnectProvider.on("disconnect", () => {
                this.disconnectWallet();
            });

        } catch (error) {
            console.error('خطا در اتصال به WalletConnect:', error);
            this.hideQRModal();
            alert('خطا در اتصال به Safepal: ' + error.message);
        }
    }

    async showQRModal() {
        if (!this.walletConnectProvider) return;

        // دریافت URI برای QR code
        const uri = this.walletConnectProvider.connector.uri;
        
        // ایجاد QR code
        const qrElement = document.getElementById('qr-code');
        qrElement.innerHTML = '';
        
        // استفاده از WalletConnect QR code modal
        WalletConnectQRCodeModal.open(uri, () => {
            console.log('QR Code Modal closed');
        });

        // یا استفاده از کتابخانه QR ساده‌تر
        // this.generateQRCode(uri, qrElement);
        
        document.getElementById('qr-modal').classList.remove('hidden');
    }

    hideQRModal() {
        document.getElementById('qr-modal').classList.add('hidden');
        if (this.walletConnectProvider && !this.userAddress) {
            this.walletConnectProvider.disconnect();
        }
    }

    generateQRCode(text, element) {
        // استفاده از یک کتابخانه QR code مانند qrcode.js
        // این یک پیاده‌سازی ساده است
        element.innerHTML = `
            <div style="text-align: center;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}" 
                     alt="QR Code" style="border: 2px solid #333;">
                <p style="margin-top: 10px; font-size: 12px; color: #666;">
                    در صورت عدم کارکرد، از لینک زیر استفاده کنید:<br>
                    <span style="word-break: break-all; font-size: 10px;">${text}</span>
                </p>
            </div>
        `;
    }

    async initializeContract() {
        this.contract = new ethers.Contract(CONTRACT_CONFIG.address, CONTRACT_CONFIG.abi, this.signer);
        
        // بررسی شبکه
        const network = await this.provider.getNetwork();
        if (network.chainId !== 137) { // Polygon Mainnet
            await this.switchToPolygonNetwork();
        }
    }

    async switchToPolygonNetwork() {
        try {
            if (this.connectionType === 'metamask') {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x89' }],
                });
            } else if (this.connectionType === 'walletconnect') {
                alert('لطفا در Safepal شبکه Polygon را انتخاب کنید');
            }
        } catch (switchError) {
            // اگر شبکه وجود نداشته باشد، آن را اضافه می‌کنیم
            if (switchError.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [POLYGON_NETWORK],
                    });
                } catch (addError) {
                    console.error('خطا در اضافه کردن شبکه:', addError);
                }
            }
        }
    }

    updateUI() {
        const shortAddress = this.userAddress.substring(0, 6) + '...' + this.userAddress.substring(38);
        document.getElementById('wallet-address').textContent = shortAddress + ` (${this.connectionType === 'metamask' ? 'MetaMask' : 'Safepal'})`;
        
        document.getElementById('connect-metamask').classList.add('hidden');
        document.getElementById('connect-walletconnect').classList.add('hidden');
        document.getElementById('disconnect-wallet').classList.remove('hidden');
        document.getElementById('buy-ticket').disabled = false;
        document.getElementById('connection-status').classList.remove('hidden');

        this.loadContractData();
        this.loadUserData();
        this.loadRecentWinners();
        this.startDataRefresh();
    }

    async disconnectWallet() {
        if (this.connectionType === 'walletconnect' && this.walletConnectProvider) {
            await this.walletConnectProvider.disconnect();
        }
        
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.userAddress = null;
        this.walletConnectProvider = null;
        this.connectionType = null;

        document.getElementById('wallet-address').textContent = '';
        document.getElementById('connect-metamask').classList.remove('hidden');
        document.getElementById('connect-walletconnect').classList.remove('hidden');
        document.getElementById('disconnect-wallet').classList.add('hidden');
        document.getElementById('buy-ticket').disabled = true;
        document.getElementById('connection-status').classList.add('hidden');
        
        document.getElementById('system-info').innerHTML = '';
        document.getElementById('pools-status').innerHTML = '';
        document.getElementById('recent-winners').innerHTML = '';
        document.getElementById('user-info').innerHTML = '';
    }

    async buyTicket() {
        try {
            const ticketCount = parseInt(document.getElementById('ticket-count').value);
            const ticketPrice = await this.contract.ticketPrice();
            const totalPrice = ticketPrice.mul(ticketCount);

            console.log(`خرید ${ticketCount} بلیط با قیمت ${ethers.utils.formatEther(totalPrice)} MATIC`);

            const transaction = await this.contract.buyTicket(ticketCount, {
                value: totalPrice,
                gasLimit: 300000 // افزایش limit گاز برای اطمینان
            });

            this.showTransactionPending(transaction.hash);

            await transaction.wait();
            
            this.showTransactionSuccess(transaction.hash);
            
            await this.loadContractData();
            await this.loadUserData();

        } catch (error) {
            console.error('خطا در خرید بلیط:', error);
            this.showTransactionError(error.message);
        }
    }

    showTransactionPending(txHash) {
        const explorerUrl = `https://polygonscan.com/tx/${txHash}`;
        alert(`تراکنش در حال پردازش...\n\nمی‌توانید وضعیت را از طریق لینک زیر پیگیری کنید:\n${explorerUrl}`);
    }

    showTransactionSuccess(txHash) {
        const explorerUrl = `https://polygonscan.com/tx/${txHash}`;
        alert(`✅ تراکنش با موفقیت تایید شد!\n\n${explorerUrl}`);
    }

    showTransactionError(error) {
        let message = 'خطا در انجام تراکنش';
        
        if (error.includes('user rejected')) {
            message = 'تراکنش توسط کاربر لغو شد';
        } else if (error.includes('insufficient funds')) {
            message = 'موجودی MATIC کافی نیست';
        } else if (error.includes('gas')) {
            message = 'خطا در پرداخت کارمزد تراکنش';
        }
        
        alert(`❌ ${message}`);
    }

    // بقیه متدها مانند قبل (loadContractData, loadUserData, etc.)
    async loadContractData() {
        try {
            if (!this.contract) return;

            const ticketPrice = await this.contract.ticketPrice();
            const ticketPriceInMatic = ethers.utils.formatEther(ticketPrice);
            document.getElementById('ticket-price').textContent = ticketPriceInMatic;

            const systemOverview = await this.contract.getSystemOverview();
            const systemInfo = `
                <div class="status-item">
                    <span class="status-label">قیمت بلیط:</span>
                    <span class="status-value">${ticketPriceInMatic} MATIC</span>
                </div>
                <div class="status-item">
                    <span class="status-label">تعداد کل بلیط‌ها:</span>
                    <span class="status-value">${systemOverview[0].toString()}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">جایزه کل:</span>
                    <span class="status-value">${ethers.utils.formatEther(systemOverview[1])} MATIC</span>
                </div>
            `;
            document.getElementById('system-info').innerHTML = systemInfo;

            const poolsStatus = await this.contract.getAllPoolsSimplifiedStatus();
            const poolsHTML = `
                <div class="pool-item">
                    <strong>پول 1:</strong> دور ${poolsStatus[0]} | بلیط‌ها: ${poolsStatus[3]} | جایزه: ${ethers.utils.formatEther(poolsStatus[6])} MATIC
                </div>
                <div class="pool-item">
                    <strong>پول 2:</strong> دور ${poolsStatus[1]} | بلیط‌ها: ${poolsStatus[4]} | جایزه: ${ethers.utils.formatEther(poolsStatus[7])} MATIC
                </div>
                <div class="pool-item">
                    <strong>پول 3:</strong> دور ${poolsStatus[2]} | بلیط‌ها: ${poolsStatus[5]} | جایزه: ${ethers.utils.formatEther(poolsStatus[8])} MATIC
                </div>
            `;
            document.getElementById('pools-status').innerHTML = poolsHTML;

        } catch (error) {
            console.error('خطا در بارگذاری داده‌های قرارداد:', error);
        }
    }

    async loadUserData() {
        try {
            if (!this.contract || !this.userAddress) return;

            const userTickets = await this.contract.getUserCurrentTickets(this.userAddress);
            const userInfo = `
                <div class="status-item">
                    <span class="status-label">بلیط‌های پول 1:</span>
                    <span class="status-value">${userTickets[0].toString()}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">بلیط‌های پول 2:</span>
                    <span class="status-value">${userTickets[1].toString()}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">بلیط‌های پول 3:</span>
                    <span class="status-value">${userTickets[2].toString()}</span>
                </div>
            `;
            document.getElementById('user-info').innerHTML = userInfo;
        } catch (error) {
            console.error('خطا در بارگذاری اطلاعات کاربر:', error);
        }
    }

    async loadRecentWinners() {
        try {
            if (!this.contract) return;

            const winners = await this.contract.getRecentWinners(5);
            let winnersHTML = '';
            
            winners.forEach(winner => {
                const shortAddress = winner.winner.substring(0, 6) + '...' + winner.winner.substring(38);
                const prize = ethers.utils.formatEther(winner.prize);
                winnersHTML += `
                    <div class="winner-item">
                        <strong>${shortAddress}</strong> - ${prize} MATIC (پول ${winner.poolId})
                    </div>
                `;
            });

            document.getElementById('recent-winners').innerHTML = winnersHTML || '<div>هنوز برنده‌ای وجود ندارد</div>';
        } catch (error) {
            console.error('خطا در بارگذاری برندگان:', error);
        }
    }

    updateTotalPrice(ticketCount) {
        const ticketPriceElement = document.getElementById('ticket-price');
        const ticketPrice = parseFloat(ticketPriceElement.textContent) || 0;
        const totalPrice = ticketPrice * ticketCount;
        
        const buyButton = document.getElementById('buy-ticket');
        buyButton.textContent = `خرید ${ticketCount} بلیط - ${totalPrice.toFixed(4)} MATIC`;
    }

    startDataRefresh() {
        setInterval(async () => {
            if (this.contract) {
                await this.loadContractData();
                await this.loadUserData();
                await this.loadRecentWinners();
            }
        }, 30000);
    }
}

// راه‌اندازی DApp
window.addEventListener('load', () => {
    new LotteryDApp();
});