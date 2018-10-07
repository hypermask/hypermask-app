import _ from 'lodash'
import React from 'react'
import ReactDOM from 'react-dom'

import Wallet from 'ethereumjs-wallet'
import passworder from 'browser-passworder'
import ethUtil from 'ethereumjs-util'
import EthereumTx from 'ethereumjs-tx'
import crypto from 'crypto'

import sigUtil from 'eth-sig-util'
import Web3 from 'web3'
import queryString from 'query-string';

import { CSSTransitionGroup } from 'react-transition-group'
import abiDecoder from 'abi-decoder'

import "./style.scss";

const PRICE_VOLATILITY_BUFFER = 1.01;
const CHAINS = [
    {
        name: 'Ethereum Main Network',
        slug: 'mainnet',
        id: '1',
        explore: 'https://etherscan.io/address/',
        token_explore: 'https://etherscan.io/token/',
        rpc: "https://mainnet.infura.io/Dpsk5u62HN582LMDXeFr"
    }, {
        name: 'Ropsten Test Network',
        slug: 'ropsten',
        id: '3',
        explore: 'https://ropsten.etherscan.io/address/',
        token_explore: 'https://ropsten.etherscan.io/token/',
        rpc: "https://ropsten.infura.io/Dpsk5u62HN582LMDXeFr",
    }, {
        name: 'Rinkeby Test Network',
        slug: 'rinkeby',
        id: '4',
        explore: 'https://rinkeby.etherscan.io/address/',
        token_explore: 'https://rinkeby.etherscan.io/token/',
        rpc: "https://rinkeby.infura.io/Dpsk5u62HN582LMDXeFr",
    }, {
        name: 'Kovan Test Network',
        slug: 'kovan',
        id: '42',
        explore: 'https://kovan.etherscan.io/address/',
        token_explore: 'https://kovan.etherscan.io/token/',
        rpc: "https://kovan.infura.io/Dpsk5u62HN582LMDXeFr",
    }, {
        name: 'INFURAnet Test Network',
        slug: 'infuranet',
        id: '5810',
        explore: 'https://explorer.infuranet.io/account/',
        rpc: "https://infuranet.infura.io/Dpsk5u62HN582LMDXeFr",
    }
]

const ERC20ABI = require('./ERC20_ABI.json')
abiDecoder.addABI(ERC20ABI)

function explore(address){
    if(app.state && app.state.to == address && app.state.isERC20 == true && chain.token_explore){
        return chain.token_explore + address + '?a=' + app.state.myAddress
    }
    return chain.explore + address
}

function findChain(idOrSlug){
    for(let chain of CHAINS){
        if(chain.slug == idOrSlug || chain.id == idOrSlug){
            return chain;
        }
    }
    return {
        name: `Custom Chain (${idOrSlug})`,
        slug: idOrSlug,
        id: idOrSlug,
        explore: 'https://example.com/',
        rpc: ''
    }
}


const query = queryString.parse(location.search);
var origin = query.origin;
var chain = findChain(query.chain || 'mainnet')

let rpcRelayProvider = {
    send(payload, callback){
        rpc('relayProvider', payload.method, ...payload.params)
            .then(result => callback(null, { jsonrpc: '2.0', id: payload.id, result: result }))
            .catch(error => callback(error, null))
    }
}

let provider = query.channel ? rpcRelayProvider : new Web3.providers.HttpProvider(chain.rpc);
global.web3 = new Web3(provider);


// This wallet password doesn't really provide any security except against
// malicious extensions or desktop viruses that scan through memory for 
// strings of bytes resembling private keys. Any sufficiently advanced
// agent can use this fixed string to decrypt the private key. 

const WALLET_PASSWORD = 'Security through obscurity is my favorite type of insecurity.'

async function getWallet(){
    let state;
    if(localStorage.encryptedHypermaskVault){
        state = await passworder.decrypt(WALLET_PASSWORD, localStorage.encryptedHypermaskVault)
    }else{
        state = {
            masterKey: crypto.randomBytes(32).toString('hex')
        }
        await setWallet(state)
    }
    let wallet = Wallet.fromPrivateKey(Buffer.from(state.masterKey, 'hex'))
    return wallet;
}

async function setWallet(state){
    localStorage.encryptedHypermaskVault = await passworder.encrypt(WALLET_PASSWORD, state);
}

async function getPrivateKey(address){
    const wallet = await getWallet()
    console.assert(wallet.getAddressString() === address.toLowerCase())
    return wallet.getPrivateKey()
}


function parallel(...fns){
    return Promise.all(fns.map(k => k()))
}

async function fixTx(txParams) {
    await parallel(async () => {
        if(txParams.gas === undefined)
            txParams.gas = web3.utils.numberToHex(await web3.eth.estimateGas(txParams));    
        if (txParams.gas !== undefined) txParams.gasLimit = txParams.gas;
    }, async () => {
        if(txParams.nonce === undefined)
            txParams.nonce = web3.utils.numberToHex(await web3.eth.getTransactionCount(txParams.from, 'pending'));    
    }, async () => {
        if(txParams.gasPrice === undefined)
            txParams.gasPrice = web3.utils.numberToHex(await web3.eth.getGasPrice());    
    }, async () => {
        if(txParams.chainId === undefined)
            txParams.chainId = web3.utils.numberToHex(await web3.eth.net.getId());    
    })

    txParams.value = txParams.value || '0x00'
    txParams.data = ethUtil.addHexPrefix(txParams.data)

    return txParams
}


async function showModal(){
    await rpc('insertStylesheet', `
        @keyframes hypermask-entrance-animation {
            from {
                transform: scale(0.7) translateY(-600px);
            }
            to {
                transform: scale(1) translateY(0px);
            }
        }
        @keyframes hypermask-exit-animation {
            from {
                transform: scale(1) translateY(0px);
            }
            to {
                transform: scale(0.7) translateY(-700px);
            }
        }
        .hypermask_modal > iframe {
            height: 483px;
            width: 350px;
            background: white;
            border: 0;
        }
    `)
    await rpc('setStyle', `
        position: fixed;
        display: block;
        z-index: 9999999999;
        top: 20px;
        right: 20px;
        border: 1px solid #d8d8d8;
        border-radius: 20px;
        overflow: hidden;
        
        animation-name: hypermask-entrance-animation;
        animation-duration: 0.4s;
        animation-fill-mode:forwards; 

        box-shadow: 0px 3px 14px #21212136;`);

    let parent = document.getElementById('payment_frame_parent');
    parent.innerHTML = ''
    parent.className = ''
    parent.style.display = 'none'
}

async function closeModal(){
    let unlock = closingMutex.lock()
    await rpc('closeModal')
    setState({ page: 'blank' })
    unlock()
}


function delay(amount){
    return new Promise((resolve) => setTimeout(resolve, amount))
}

function roundUSD(usdAmount){
    return usdAmount > 100 ? 
        Math.ceil(usdAmount) : 
        usdAmount.toFixed(2)
}

// an awaitable queue is an object with two methods
// pop() returns a promise that resolves when the next bit of data pushed onto the queue
// unless there is already a surplus of data pushed onto the queue, in that case it returns
// immediately.
// push(data) adds the data to the queue, invoking promises waiting for data if present.

function makeAwaitableQueue(){
    let queue = [],
        resolvers = [];
    return {
        pop(){
            if(queue.length > 0) return Promise.resolve(queue.shift());
            return new Promise((resolve, reject) => resolvers.push(resolve) )
        },
        push(payload){
            if(resolvers.length > 0) resolvers.shift()(payload)
            else queue.push(payload);
        }
    }
}

// a mutex is an object which has two methods
// free() a function which returns a promise that resolves when all the locks are freed
// lock() a function that returns a function unlock() which you can call to mark the mutex as resolved
// you can set up concurrent locks (i.e. run these two tasks simultaneously, but only free when both are freed).
// as a convenience method, the mutex object is itself an async function that takes an async function
// which waits until it is free, allocates a lock, and then resolves the lock, when the function is finished

function makeMutex(){
    let mutex_promise = Promise.resolve(true);
    async function mutex(fn){
        await mutex.free();
        let unlock = mutex.lock()
        try {
            return await fn()
        } finally { unlock() }
    }
    mutex.free = () => mutex_promise;
    mutex.lock = () => {
        let unlock,
            next = new Promise((resolve, reject) => unlock = resolve)
        mutex_promise = mutex_promise.then(() => next)
        return () => { setTimeout(() => unlock(true), 0) }
    }
    return mutex
}

function makeFlow(controller, catcher){
    return function(...args){
        return new Promise((resolve, reject) => {
            let ctx = {
                fail(reason){
                    if(ctx.failed) return;
                    ctx.failed = reason || true;
                    try { if(catcher) catcher.call(ctx); } 
                    finally { reject(reason) }
                },
                check(value){
                    if(ctx.failed) throw new Error(ctx.failed);
                    return value;
                }
            }
            controller.apply(ctx, args)
                .then(result => resolve(result))
                .catch(error => ctx.fail(error));
        })
    }
}

let closingMutex = makeMutex()

function interactive(fn, eventName){
    return makeFlow(async function(...args){
        await closingMutex.free()

        if(app.state.fail){
            if(eventName) Event(eventName + ' cancelled by newer request');
            app.state.fail('Transaction cancelled by newer transaction request')
        }
        let ctx = this;
        Object.assign(this, {
            setState(obj){
                ctx.check()
                if(app.state.fail !== ctx.fail) ctx.fail('Flow has already failed');
                setState(obj)
            },
            _next: makeAwaitableQueue(),
            next(){
                return ctx._next.pop()
            },
            resetNext(){
                this._next = makeAwaitableQueue()
            }
        })
        setState({ 
            fail: this.fail, 
            next: () => ctx._next.push(true)
        })
        await showModal();
        let hasError;
        if(eventName) Event(eventName);
        try {
            let result = await fn.apply(this, args)    
            await delay(100);
            return result;
        } catch (err) {
            if(eventName) Event(eventName + ' aborted (' + err.message + ')');
            hasError = err;
        } finally {
            if(!hasError) (async () => {
                await delay(500);
                if(app.state.fail === ctx.fail){
                    await closeModal();
                }
            })();
        }
    }, async function(){
        // if a new modal is created immediately, dont close the old one
        await delay(100);
        if(app.state.fail === this.fail){
            await closeModal()
        }
    })
}


async function interactiveSignatureRequest(message){
    this.setState({ 
        page: 'widget', 
        screen: 'sign',
        message: message,
    })
    await this.next();
    this.setState({ page: 'widget', screen: 'finish' })
}


async function getEthereumPrice(){
    let coinbasePriceResponse = await (await fetch('https://api.coinbase.com/v2/prices/ETH-USD/buy')).json()
    // should we increase price by 1% to cope with volatility?
    // let ethUSDPrice = coinbasePriceResponse.data.amount * PRICE_VOLATILITY_BUFFER; 
    // return ethUSDPrice
    return coinbasePriceResponse.data.amount
}

async function untilVisible(){
    while(true){
        if(!document.hidden) return;
        await delay(1000);
    }
}

var sessionDeanonymized = !localStorage.requireIdentityApproval;

const rpcMethods = {
    async eth_accounts(){
        if(!sessionDeanonymized){
            try {
                await interactive(async function(){
                    this.setState({ page: 'widget', screen: 'identify' })
                    await this.next();
                    this.setState({ page: 'widget', screen: 'finish' })
                })();
                sessionDeanonymized = true;
            } catch (err) {
                Event('Request Account ID (Denied)')
                return [] 
            }
            Event('Request Account ID (Approved)')
        }else{
            Event('Request Account ID')
        }
        return [ (await getWallet()).getAddressString() ]
    },
    personal_sign: interactive(async function(message, from){
        await interactiveSignatureRequest.call(this, 
            web3.utils.hexToAscii(message))
        if(ethUtil.isValidAddress(message) && !ethUtil.isValidAddress(from)){
            console.warn('The eth_personalSign method arguments were flipped.');
            [message, from] = [from, message];
        }
        const serialized = sigUtil.personalSign(await getPrivateKey(from), 
            { from: from, data: message })
        return serialized
    }, 'personal_sign'),
    eth_sign: interactive(async function(from, message){
        await interactiveSignatureRequest.call(this, 
            web3.utils.hexToAscii(message))
        const serialized = sigUtil.personalSign(await getPrivateKey(from), 
            { from: from, data: message })
        return serialized
    }, 'eth_sign'),
    eth_signTypedData: interactive(async function(message, from, extraParams){
        await interactiveSignatureRequest.call(this, 
            message.map(k => k.name + ': ' + JSON.stringify(k.value, null, '  ')).join('\n'))
            // JSON.stringify(message, null, '  '))
        const serialized = sigUtil.signTypedData(await getPrivateKey(from), 
            { ...extraParams, from: from, data: message })
        return serialized
    }, 'signTypedData'),
    eth_sendTransaction: interactive(async function(txParams){        
        this.setState({  page: 'widget',  screen: 'loading' })

        console.assert((await getWallet()).getAddressString() === txParams.from.toLowerCase(),
            "'from' field for transaction must be current address.")

        let _currentBalance = web3.eth.getBalance(txParams.from, 'pending');
        let _ethUSDPrice = getEthereumPrice();

        txParams = await fixTx(txParams);
        let priceEstimate = BN(txParams.value).add(
            BN(txParams.gasPrice).mul(
                BN(txParams.gas)
            )
        )
        let ethAmount = web3.utils.fromWei(priceEstimate, 'ether');
        let currentBalance = await _currentBalance;
        let sufficientLeftovers = priceEstimate.lt(BN(currentBalance));

        let ethUSDPrice = await _ethUSDPrice;
        this.setState({ ethUSDPrice: ethUSDPrice })

        let contractCode = await web3.eth.getCode(txParams.to);
        
        // 18160ddd -> totalSupply()
        // 70a08231 -> balanceOf(address)
        // dd62ed3e -> allowance(address,address)
        // a9059cbb -> transfer(address,uint256)
        // 095ea7b3 -> approve(address,uint256)
        // 23b872dd -> transferFrom(address,address,uint256)

        let isERC20 = /70a08231/.test(contractCode) // balanceOf(address)
            && /a9059cbb/.test(contractCode); // transfer(address,uint256)


        this.setState({
            to: txParams.to,
            myAddress: txParams.from,
            priceEstimate: priceEstimate,
            currentBalance: currentBalance,
            contractCode: contractCode,
            isERC20: isERC20
        })


        if(isERC20){
            try {
                const ERC20 = new web3.eth.Contract(ERC20ABI, txParams.to, {})
                var tokenName = await ERC20.methods.name().call(),
                    tokenSymbol = await ERC20.methods.symbol().call(),
                    tokenDecimals = await ERC20.methods.decimals().call(),
                    tokenBalance = await ERC20.methods.balanceOf(txParams.from).call(),
                    txData = abiDecoder.decodeMethod(txParams.data);
            } catch (err) {
                Event('ERC20 Error', 0)
            }
            if(tokenName){
                // console.log(tokenName, tokenDecimals, tokenBalance, txParams, txData)
                Event('ERC20', tokenBalance)
                let tokenMethodParams = _.fromPairs(txData.params.map(k => [k.name, k.value]));

                this.setState({ 
                    page: 'widget', 
                    screen: 'token',

                    insufficientTokens: BN(tokenMethodParams._value).gt(BN(tokenBalance)),
                    tokenName: tokenName,
                    tokenSymbol: tokenSymbol,
                    tokenDecimals: tokenDecimals,
                    tokenBalance: tokenBalance,
                    tokenMethodName: txData.name,
                    tokenMethodParams: tokenMethodParams,
                })
                await this.next();
                this.setState({ page: 'widget', screen: 'loading' })
                await delay(400);

            }
        }

        if(sufficientLeftovers){
            Event('Sufficient Leftover Funds', currentBalance)
            // we have enough money to pay with it using leftovers
            this.setState({ 
                page: 'widget', 
                screen: 'leftover',
            })

            await this.next();
            this.setState({ page: 'widget', screen: 'loading' })
        }else{
            Event('Request Funds', priceEstimate)
            this.setState({ 
                page: 'widget', 
                screen: 'credit',
            })
        
            let blockNumber = await web3.eth.getBlockNumber()

            await this.next();
            this.setState({ page: 'widget', screen: 'loading' })
            let neededWei = priceEstimate.sub(BN(currentBalance));
            let ether = parseFloat(web3.utils.fromWei(neededWei, 'ether'));

        
            let usdAmount = Math.max(1, roundUSD(ether * ethUSDPrice * PRICE_VOLATILITY_BUFFER));    

            await runPaymentFlow.call(this, usdAmount, txParams.from);
            
            this.setState({ page: 'widget', screen: 'wait', phase: 'pending' })

            let parent = document.getElementById('payment_frame_parent');
            parent.className = 'exit'
            await delay(1000);
            parent.innerHTML = ''
            parent.style.display = 'none'

            // poll until we've the new transaction (this should be quick)
            for(let i = 0; true; i++){
                await untilVisible();
                let newBalance = await web3.eth.getBalance(txParams.from, 'pending');
                console.log('new balance (pending)', newBalance)
                if(BN(newBalance).gt(priceEstimate)) break;
                await delay(1000 + 100 * i);
                this.check();
            }

            Event('Found Transaction')

            this.setState({ page: 'widget', screen: 'wait', phase: 'latest' })
            for(let i = 0; true; i++){
                await untilVisible();
                let newBalance = await web3.eth.getBalance(txParams.from, 'latest');    
                console.log('new balance (latest)', newBalance)
                if(BN(newBalance).gt(priceEstimate)) break;
                await delay(5000 + 100 * i);
                this.check();
            }
            
        }
        Event('Sending Transaction', priceEstimate)
        this.check();
        this.setState({ page: 'widget', screen: 'finish' })
        const tx = new EthereumTx(txParams)
        tx.sign(await getPrivateKey(txParams.from))
        const serializedTx = tx.serialize()
        const signedTx = ethUtil.bufferToHex(serializedTx);
        // console.log('sending things', signedTx)

        return await new Promise((resolve, reject) =>
            web3.eth.sendSignedTransaction(signedTx)
                .on('transactionHash', resolve)
                .on('error', reject))
    }, 'eth_sendTransaction'),
}



var rpcHandlers = {};
async function rpc(method, ...params){
    let msg = {
        app: 'hypermask-call',
        channel: query.channel,
        id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
        method: method,
        params: params
    };
    window.parent.postMessage(msg, origin)
    return await new Promise((resolve, reject) => {
        rpcHandlers[msg.id] = [ resolve, reject ]
    })
}

window.addEventListener("message", function(event){
    if(event.data && event.data.app === 'hypermask-call' && origin === event.origin){
        let data = event.data;
        if(!rpcMethods[data.method]){
            event.source.postMessage({ app: 'hypermask-reply', channel: query.channel, id: data.id, error: `Error: RPC method ${data.method} not implemented. ` }, origin)
            return
        }
        rpcMethods[data.method](...data.params)
            .then(result => event.source.postMessage({ app: 'hypermask-reply', channel: query.channel, id: data.id, result: result }, origin))
            .catch(error => {
                // console.error(error)
                event.source.postMessage({ app: 'hypermask-reply', channel: query.channel, id: data.id, error: (error || 'Error') + '' }, origin)
            })
    }else if(event.data && event.data.app === 'hypermask-reply' && origin === event.origin){
        let data = event.data;
        if(data.id in rpcHandlers){
            let [resolve, reject] = rpcHandlers[data.id];
            if(data.error){
                reject(data.error)
            }else{
                resolve(data.result)
            }
            delete rpcHandlers[data.id];
        }else{
            console.warn(data.id, 'not in rpcHandlers')
        }
    }else if(event.data && event.data.event && event.origin === paymentFrameOrigin){
        handlePaymentFrameEvent(event)
    }
}, false);


let paymentFrameOrigin = '';
async function runPaymentFlow(amount, address){
    let parent = document.getElementById('payment_frame_parent');
    parent.style.display = ''
    parent.className = ''
    
    let url;
    let embedFrame = false;
    if(chain.slug === 'mainnet'){
        url = 'https://buy.coinbase.com/?' + queryString.stringify({
            address: address,
            amount: amount, // minimum purchase of $1
            code: '93cc359c-bf50-5ecc-b780-db05d4fbe263',
            currency: 'USD',
            prefill_name: undefined,
            prefill_phone: undefined,
            prefill_email: undefined,
            crypto_currency: 'ETH',
            state: undefined
        });

    }else{
        url = 'https://hypermask.io/foinbase.html?' + queryString.stringify({
            address: address,
            amount: amount,
            chain: chain.slug,
            currency: 'USD',
        });
        embedFrame = true;
    }
    if(query.embed !== undefined){
        embedFrame = query.embed != 'false'
    }
    if(embedFrame){
        let link = document.createElement('a')
        link.href = url;
        paymentFrameOrigin = link.origin;
        
        parent.innerHTML = ''
        let frame = document.createElement('iframe')
        frame.id = "payment_modal_iframe" 
        frame.name = "payment_modal_iframe" 
        frame.scrolling = 'no'
        frame.allowtransparency = 'true'
        frame.frameborder = '0'
        frame.src = url;
        parent.appendChild(frame)

        await new Promise((resolve, reject) => {
            frame.onload = resolve
            frame.onerror = reject
        })

        parent.className = 'enter'    

        this.resetNext()
        await this.next()
    }else{
        let frame = window.open(url)

        this.setState({ page: 'widget', screen: 'stall' })

        while(true){
            if(frame.closed) break;
            await delay(500);
        }
    }
}

function handlePaymentFrameEvent(e) {
    if(e.data.event === "modal_closed") {
        if(app.state.fail){ app.state.fail('Transaction cancelled from payment frame') }
    }else if(e.data.event === 'buy_completed'){
        app.state.next()
    }else if(e.data.event === 'buy_canceled'){
        if(app.state.fail){ app.state.fail('Transaction cancelled from payment frame') }
    }
}

function Event(action, amount){
    if(!localStorage.disableAnalytics && window.ga){
        ga('send', {
            hitType: 'event',
            eventCategory: chain.name,
            eventAction: action,
            eventValue: amount === undefined ? undefined : web3.utils.fromWei(amount, 'microether')
        });
    }
}

function setState(newState){
    app.setState(newState)
}

class App extends React.Component {
    constructor(){
        super()
        this.state = global.app ? global.app.state : {}
        global.app = this;
    }
    componentDidMount(){
        if(window.parent === window){
            updateDashboard()
        }
    }
    render(){
        let state = this.state;
        if(state.page === 'widget'){
            return <Widget />
        }else if(state.page === 'dashboard'){
            return <Dashboard />    
        }else{
            return <div></div>
        }
    }
}

async function updateDashboard(){
    setState({ page: 'dashboard' })
    let ethUSDPrice = await getEthereumPrice();
    let wallet = await getWallet();
    let myAddress = wallet.getAddressString();

    setState({
        ethUSDPrice: ethUSDPrice,
        currentBalance: await web3.eth.getBalance(myAddress, 'pending'), // does this pending qualifier do anything?
        // resolvedBalance: await web3.eth.getBalance(myAddress, 'latest'), // does this pending qualifier do anything?
        myAddress: myAddress

    })
}


const BN = x => web3.utils.toBN(x || '0');


function Widget(props){
    document.body.className = 'widget'
    let state = app.state;

    let body, next, abort = 'Cancel';
    
    if(state.screen === 'loading'){
        next = <div className="button loading">Loading...</div>
        body = <SpinnerBody key='loading' />
    }else if(state.screen === 'wait'){
        next = <div />
        body = <WaitBody key='wait' />
    }else if(state.screen === 'stall'){
        next = <div />
        body = <StallBody key="stall" />
    }else if(state.screen === 'finish'){
        next = <div />
        body = <SpinnerBody key='loading' />
    }else if(state.screen === 'token'){
        next = <div className="button continue">Continue <RightArrow /></div> 
        body = <TokenBody />

        // insufficient token funds to continue.
        if(state.insufficientTokens){
            next = <div />;
            abort = 'Close';
        }
    }else if(state.screen === 'identify'){
        abort = 'Reject'
        next = <div className="button confirm">Allow <CheckMark /></div> 
        body = <IdentityBody key='identity' />
    }else if(state.screen === 'leftover'){
        next = <div className="button confirm">Confirm <CheckMark /></div> 
        body = <LeftoverBody key='b' />  
    }else if(state.screen === 'credit'){
        next = <div className="button continue">Continue <RightArrow /></div> 
        body = <CardBody />
    }else if(state.screen === 'sign'){
        next = <div className="button confirm">Sign <CheckMark /></div> 
        body = <SignBody />
    }else{
        next = <div />
        body = <div className="body">ERROR: Screen "{state.screen}" not recognized. </div>
    }

    return <div id="app">
        <WidgetHeader />
        <div className="main">
            <CSSTransitionGroup
              transitionName="fade"
              transitionEnter={true}
              transitionEnterTimeout={300}
              transitionLeave={true}
              transitionLeaveTimeout={300}>
              { body }
            </CSSTransitionGroup>
        </div>
        { state.screen === 'finish' ? null : <div className="footer">
            <div className="button cancel" onClick={e => state.fail('Transaction cancelled by user')}>{abort}</div>
            <div className="spacer" />
            <div style={{ position: 'relative' }} onClick={e => state.next()}>
                <CSSTransitionGroup
                  transitionName="fade"
                  transitionEnter={true}
                  transitionEnterTimeout={300}
                  transitionLeave={true}
                  transitionLeaveTimeout={300}>
                  { next }
                </CSSTransitionGroup>
            </div>
        </div>}
    </div>
}

function IdentityBody(){
    return <div className='body' key='identify'>
        <h2>Reveal Identity</h2>
        <p>
            This app has requested information about your HyperMask Ethereum account.
        </p>
        <p className="caveat">
            If you allow this request, this app will be able to see your current account balance and transaction history. 
        </p>
        <p className="caveat">
            Rejecting this request may limit your ability to use this application. It will not be able to request funds or signatures.
        </p>
    </div>
}
function StallBody(){
    return <div key='stall' className='body'>
        <h2>Buy from Coinbase</h2>
        <p className="caveat">
            We've opened a new page where you can purchase ETH via <b>Coinbase</b>. 

            Buy the requested amount of ETH with your <b>Debit Card</b> or <b>Bank Account</b>. 
        </p>
        <p className="caveat">
            Once you've finished purchasing the ETH, <b>close that tab</b> and the transaction will continue from here. 
        </p>
    </div>
}
function WaitBody(){
    let state = app.state;

    return <div className={"body spinner wait-" + state.phase}>
        <HypermaskLogo width={300} height={200} clock speed={3} />
        
        <p className="caveat" style={{marginTop: -20}}>
            Waiting for <b>Coinbase</b> to transfer ETH into your <a target="_blank" href={explore(state.myAddress)}><b>HyperMask wallet</b></a>. This may take a few minutes. { state.phase == 'latest' ? <span>
                Waiting for blockchain confirmation...
            </span>: <span>Searching for inbound transaction...</span>}
        </p>
        <p className="caveat">
            Pressing <b>Cancel</b> will cancel the app's transaction, but
            your purchased ETH will stay in HyperMask for use in future transactions.
        </p>
    </div>
}

function SpinnerBody(){
    let state = app.state;

    return <div className={"body spinner  spinner-" + state.screen}>
        <HypermaskLogo width={300} height={200} speed={3} />
    </div>
}

function WidgetHeader(){
    return <div className={"header" + ((chain.slug === 'mainnet') ? ' mainnet' : ' testnet')}>
        <div className="name">
          <a target="_blank" href={location.origin + location.pathname + "?chain=" + chain.slug}>
            <h1><span className="thin">Hyper</span>Mask</h1>
            <div className="slogan">{
                chain.slug === 'mainnet' ? <span>decentralized apps for everyone</span> : 
                <span>{chain.name}</span>
            }</div>
          </a>
        </div>
        <HypermaskLogo />
    </div>
}

function SignBody(){
    return <div className="body">
        <h2>Sign Message</h2>
        <p>This app has requested <b>your signature</b> on the following message:</p>
        <pre>{app.state.message || <i>(empty message)</i>}</pre>
    </div>
}


// TODO: we should make an interface to EtherDelta's contract that is really simple and easy and good.
function TokenBody(){
    let state = app.state;

    function d(n){
        let s = '00000000000000000000' + BN(n).toString()
        return (s.slice(0, -state.tokenDecimals).replace(/^0+/, '') || '0') + '.' + s.slice(-state.tokenDecimals);
    }

    return <div className="body">
        <h2>Transfer <a target="_blank" href={explore(state.to)}><u>{state.tokenName}</u></a></h2>
        <p>This app has requested <b>{d(state.tokenMethodParams._value)} {state.tokenSymbol}</b>. 
        You have <b>{d(state.tokenBalance)} {state.tokenSymbol}</b> in your account.</p>
        {state.insufficientTokens ? [<p style={{ color: 'red' }}>
            <b>You do not have enough {state.tokenName} to complete this transaction.</b>
        </p>, <p>
            Transfer <b> {d(BN(state.tokenMethodParams._value).sub(BN(state.tokenBalance)))} {state.tokenSymbol} </b>
            to your <a target="_blank" href={location.origin + location.pathname + "?chain=" + chain.slug}><b>HyperMask wallet</b></a> and try again. 
            You may be able to purchase through a token exchange such as <a href="https://forkdelta.github.io/" target="_blank"><b>ForkDelta</b></a>.
        </p>]: [<p>
            You have enough <b>{state.tokenName}</b> to complete this transaction with 
            <b> {d(BN(state.tokenBalance).sub(BN(state.tokenMethodParams._value)))} {state.tokenSymbol} </b> 
            to spare.
        </p>, <p>
            You will also need <Price wei={state.priceEstimate} /> cover the transaction fee.
        </p>]}
        
    </div>
}

function Price(props){
    let state = app.state;

    let ether = parseFloat(web3.utils.fromWei(props.wei, 'ether'));
    if(app.state.ethUSDPrice){
        // if you have enough money in your account, display the raw price
        // otherwise if you need to get money from coinbase, increase the
        // volatility and round up.
        if(BN(state.priceEstimate).gt(BN(state.currentBalance))) {
            value = Math.max(1, roundUSD(ether * state.ethUSDPrice * PRICE_VOLATILITY_BUFFER));    
        }else{
            value = roundUSD(ether * state.ethUSDPrice);
        }
        return <span><b>${ value } USD</b> ({ether} ETH)</span>
    }else{
        return <span>{ether} ETH</span>
    }
}

function Recipient(){
    let state = app.state;
    // https://ethereum.stackexchange.com/questions/38381/how-can-i-identify-that-transaction-is-erc20-token-creation-contract
    return <a target="_blank" href={explore(state.to)}>This {
        state.contractCode === '0x' ? 
            <b>user</b> : <b>app</b> }</a>;
}


function LeftoverBody(){
    let state = app.state;

    return <div className="body">
        <h2>Pay with Leftover Funds</h2>
        
        <p><Recipient /> has requested <Price wei={state.priceEstimate} /> to continue.</p>
        <p>You have <Price wei={state.currentBalance} /> available in leftover funds— enough to complete this 
        transaction with  <Price wei={BN(state.currentBalance).sub(state.priceEstimate)} /> to spare.</p>
    </div>
}

function CardBody(){
    let state = app.state;
    
    return <div className="body">
        <h2>Pay with Debit Card</h2>
        {
            BN(state.currentBalance).isZero() ?
            <p><Recipient /> has requested <Price wei={state.priceEstimate} buffer /> to continue.</p> :
            <p><Recipient /> has requested <Price wei={state.priceEstimate} />, but due to leftover funds, only <Price buffer wei={
                state.priceEstimate.sub(BN(state.currentBalance))
            } /> is needed to continue.</p>
        }
        
        <p><a target="_blank" href="https://hypermask.io/"><b>HyperMask</b></a> lets you securely transfer ETH to decentralized apps with your <b>Debit Card</b> via <a target="_blank" href="https://coinbase.com/"><b>Coinbase</b></a>. </p>
        <p className="caveat">If you regularly use decentralized apps like this one, consider installing a browser extension such as <a target="_blank" href="https://metamask.io/"><b>MetaMask</b></a> as it may be cheaper in the long run.</p>
    </div>
}

function RightArrow(){
    return <svg width="23" height="20" viewBox="0 0 28 24" version="1.1">
        <g id="Canvas" transform="translate(-1447 -11449)">
        <g id="Vector 2">
        <use href="#path0_stroke" transform="translate(1447.24 11449.8)" fill="#2F80ED"/>
        </g>
        </g>
        <defs>
        <path id="path0_stroke" d="M 25.5956 10.3415L 26.3955 10.9417L 26.8726 10.3059L 26.3608 9.69767L 25.5956 10.3415ZM 0 11.3415L 25.5956 11.3415L 25.5956 9.34154L 0 9.34154L 0 11.3415ZM 26.3608 9.69767L 17.6583 -0.643865L 16.1281 0.643865L 24.8305 10.9854L 26.3608 9.69767ZM 24.7958 9.74134L 16.0934 21.3387L 17.6931 22.5391L 26.3955 10.9417L 24.7958 9.74134Z"/>
        </defs>
    </svg>
}

function CheckMark(){
    return <svg width="18" height="18" viewBox="0 0 27 27" version="1.1" >
        <g id="Canvas" transform="translate(7015 -14011)">
        <g id="Vector 2">
        <use href="#path0_stroke" transform="translate(-7013.44 14012.5)" fill="#27AE60"/>
        </g>
        </g>
        <defs>
        <path id="path0_stroke" d="M 7.85463 22.7141L 6.7948 23.7756L 8.06397 25.0428L 9.08679 23.5696L 7.85463 22.7141ZM 22.3922 -0.855448L 6.62247 21.8587L 9.08679 23.5696L 24.8565 0.855448L 22.3922 -0.855448ZM 8.91446 21.6527L 1.05983 13.8104L -1.05983 15.9333L 6.7948 23.7756L 8.91446 21.6527Z"/>
        </defs>
    </svg>

}

class HypermaskLogo extends React.Component {
    constructor(){
        super()

        let orig_points = [[343,114], [441, 99], [501,129], [503, 189], [471, 244], [423,244], [368,230], [332,169], [386,177], [441,189], [434, 134]];

        let params = [];
        for(let i = 0; i < orig_points.length; i++){
          params.push([
            5 + 5 * Math.random(),
            1 * Math.random(),
            3 * Math.random()
          ])
        }

        this.state = {
            orig_points: orig_points,
            params: params,
            start: Date.now()
        }
    }
    componentDidMount(){
        const renderLoop = () => {
            if(window.scrollY < 300){
                this.setState({})    
            }
            this.rAF = requestAnimationFrame(renderLoop)
        }
        this.setState({ start: Date.now() })
        renderLoop()
    }
    componentWillUnmount(){
        cancelAnimationFrame(this.rAF)
    }
    render(){
        let { orig_points, params, start } = this.state;

        let points = []
        let t = Date.now()/700 * (this.props.speed || 1);
        for(let i = 0; i < orig_points.length; i++) {
            let d = params[i];
            points.push([
                orig_points[i][0] + d[0] * Math.sin(t * d[1] + d[2]) - 300,
                orig_points[i][1] + d[0] * Math.sin(t * d[1] + d[2]) - 80
            ])
        }

        let lines = [ [0, 7], [0, 8], [8, 5], [8, 6], [5, 9], [9, 3], [9, 4], [1, 10], [10, 3], [10, 2], [10, 8] ];
        for(let i = 0; i < points.length; i++){
            lines.push([i, (i + 1) % points.length])
        }

        function formatTime(seconds){
            if(seconds < 60){
                return seconds
            }else if(seconds < 60 * 60){
                return Math.floor(seconds / 60) + ':' + ('00' + (seconds % 60)).slice(-2)
            }else{
                return Math.floor(seconds/60/60) + ':' + 
                    ('00' + Math.floor((seconds / 60) % 60)).slice(-2) + ':' + 
                    ('00' + (seconds % 60)).slice(-2);
            }
        }
        return <svg className="hypermask-logo" width="80" height="80" viewBox="0 0 250 200" {...this.props}>{
            lines.map((k, i) => <line 
                key={i}
                x1={points[k[0]][0]}
                y1={points[k[0]][1]}
                x2={points[k[1]][0]}
                y2={points[k[1]][1]} />)
        }{
            points.map((k, i) => <circle cx={k[0]} cy={k[1]} key={i} />)
        }
            {this.props.clock ? <text x="125" y="100">{ formatTime(Math.round((Date.now() - start) / 1000) + 1) }</text> : null}
        </svg>
    }

}


const HYPERMASK_DEV_ADDRESS = '0x658AC8Dab114EE16Fba37f3c18Ad734a3542bF63';

function Dashboard(){
    let state = app.state;
    document.body.className = 'dashboard' + (chain.slug === 'mainnet' ? ' mainnet' : ' testnet')

    return <div className={"main"}>
        <div className="header">
            <HypermaskLogo width={400} height={300} />
            <div>
                <h1><span className="thin">Hyper</span>Mask</h1>
                <h2>Dashboard</h2>
            </div>
        </div>
        <div className="block">
            { !state.currentBalance ? null : <div>You have <Price wei={state.currentBalance} /></div> }

            { !state.myAddress ? null : <div><b>Address: </b> 
                <a target="_blank" href={explore(state.myAddress)}>{state.myAddress}</a></div>}

            <div><b>Chain: </b> {chain.name}</div>

            <div className='caveat'>
                HyperMask maintains a local Ethereum wallet in your browser— its private keys never leave your computer.
                Funds are briefly sent from Coinbase to your HyperMask wallet, after which the funds are immediately
                spent on the requested transaction. 
                Value may be left over in your HyperMask wallet due to changes in Ethereum's price during
                the purchase process, if a transaction fails and gets refunded by the network, or if ETH 
                is sent to your wallet address (for instance from contract earnings). 
            </div>
            <div className='caveat'>
                As your HyperMask wallet is accessible to anyone with physical access to your computer,
                you should not use Hypermask to hold substantial amounts of ether. Think of HyperMask's
                wallet as a jar for storing loose change, rather than a bank vault for storing your life savings. 
            </div>
        </div>
        <div className="block">
            <div>
            <button style={{ background: '#ff00c3' }} onClick={async () => {
                Event('Download Private Key')
                let link = document.createElement('a')
                let wallet = await getWallet()
                let blob = new Blob([ wallet.getPrivateKeyString(), '\n' ], {
                    type: 'application/octet-stream'
                })
                link.style.position = 'absolute'
                link.style.left = '-1000px'
                link.style.top = '-1000px'
                link.href = URL.createObjectURL(blob);
                link.download = 'HyperMaskPrivateKeyBackup.dat';
                document.body.appendChild(link)
                link.click()
            }}><b>Download</b> Private Key Backup</button>

            <button style={{ float: 'right', background: 'rgb(106, 153, 217)' }} onClick={() => {
                let input = document.createElement('input')
                input.type = 'file'
                input.onchange = function(){
                    console.log(input.files)
                    if(input.files.length === 0) return;
                    let file = input.files[0];
                    let fr = new FileReader()
                    fr.onload = async function(){
                        let restoredPK = Buffer.from(web3.utils.hexToBytes(fr.result.trim()))
                        let restoredWallet = Wallet.fromPrivateKey(restoredPK);
                        let restoredBalance = BN(await web3.eth.getBalance(restoredWallet.getAddressString(), 'pending'))

                        let wallet = await getWallet()
                        let currentBalance = BN(await web3.eth.getBalance(wallet.getAddressString(), 'pending'));

                        if(wallet.getAddressString() === restoredWallet.getAddressString()){
                            Event('Restore Current Wallet')
                            alert("No need to import your current wallet.")

                        }else if(currentBalance.isZero()){
                            console.log('current wallet balance is zero, swapping out private key')
                            // we can swap out the old private key

                            if(confirm('Do you want to replace the current empty wallet with this restored wallet?\nPress cancel if you have any ERC20 tokens associated with the empty account.')){
                                let state = {
                                    masterKey: restoredWallet.getPrivateKey().toString('hex')
                                }
                                Event('Replace Empty Wallet', restoredBalance)
                                setWallet(state)
                                // alert('Current (empty) wallet replaced with imported wallet.')
                                updateDashboard()    
                            }else{
                                Event('Replace Empty Wallet (Cancel)', restoredBalance)
                            }

                        }else{
                            // we transfer the balance of the old key into the new key
                            if(restoredBalance.isZero()){
                                Event('Import Empty Wallet', restoredBalance)
                                alert(`${restoredWallet.getAddressString()} appears to be an empty wallet.`)
                                return;
                            }

                            let txObj = {
                                from: restoredWallet.getAddressString(),
                                to: wallet.getAddressString(),
                                value: restoredBalance
                            }
                            txObj = await fixTx(txObj);

                            let gasValue = BN(txObj.gasPrice).mul(BN(txObj.gas))
                            txObj.value = restoredBalance.sub(gasValue)

                            let newBalance = txObj.value.add(currentBalance);

                            if(confirm(`Do you want to transfer ${web3.utils.fromWei(txObj.value, 'ether')
                                } ETH from ${restoredWallet.getAddressString()} into your current wallet (${
                                wallet.getAddressString()})?\n\n${web3.utils.fromWei(gasValue, 'ether')} ETH (${
                                (100*gasValue.div(restoredBalance).toNumber()).toFixed(4)
                                }%) of the value in the account will be lost to transaction fees. Your new balance will be ${
                                web3.utils.fromWei( newBalance, 'ether' )} ETH (an increase of ${
                                (100 * newBalance.toNumber() /currentBalance.toNumber() ).toFixed(2) }%).`)) {


                                Event('Import Wallet', restoredBalance)

                                const tx = new EthereumTx(txObj)
                                tx.sign(restoredWallet.getPrivateKey())
                                const serializedTx = tx.serialize()
                                const signedTx = ethUtil.bufferToHex(serializedTx);
                                


                                web3.eth.sendSignedTransaction(signedTx)
                                    .on('transactionHash', () => setTimeout(updateDashboard, 500))
                                    .on('receipt', () => setTimeout(updateDashboard, 500))
                                    .on('confirmation', () => setTimeout(updateDashboard, 500))
                                    .on('error', error => alert(error))
                            }else{
                                Event('Import Wallet (Cancel)', restoredBalance)
                            }
                            

                        }
                        // console.log(fr.result.trim())
                    }
                    fr.readAsText(file)
                }
                input.click()
            }}><b>Import</b> Private Key Backup</button>
            </div>

            <div className='caveat'>
                All wallet funds associated with this browser will be irrevocably lost if you clear website data 
                associated with hypermask.io without first saving a backup of your private key. 
            </div>

            { BN(state.currentBalance || '0').isZero() ? null : <div>
                <button style={{ background: '#27AE60' }} onClick={async () => {
                    let wallet = await getWallet()
                    let currentBalance = BN(await web3.eth.getBalance(wallet.getAddressString(), 'pending'));


                    let txObj = {
                        from: wallet.getAddressString(),
                        to: HYPERMASK_DEV_ADDRESS,
                        value: currentBalance
                    }
                    txObj = await fixTx(txObj);
                    let gasValue = BN(txObj.gasPrice).mul(BN(txObj.gas))
                    txObj.value = currentBalance.sub(gasValue)
                    

                    if(confirm(`Do you want to donate ${web3.utils.fromWei(currentBalance, 'ether')
                        } ETH to the HyperMask development team (${wallet.getAddressString()})?\n\n${
                        web3.utils.fromWei(gasValue, 'ether')} ETH (${
                        (gasValue.mul(BN(10000) ).div(currentBalance).toNumber() / 100).toFixed(2)
                        }%) will be lost to transaction fees.`)){

                        Event('Donate (Sent)', currentBalance)

                        const tx = new EthereumTx(txObj)
                        tx.sign(wallet.getPrivateKey())
                        const serializedTx = tx.serialize()
                        const signedTx = ethUtil.bufferToHex(serializedTx);

                        web3.eth.sendSignedTransaction(signedTx)
                            .on('transactionHash', () => {
                                setTimeout(updateDashboard, 500)
                                alert('Thank you for your contribution!')
                            })
                            .on('receipt', () => setTimeout(updateDashboard, 500))
                            .on('confirmation', () => setTimeout(updateDashboard, 500))
                            .on('error', error => alert(error))


                    }else{
                        Event('Donate (Cancel)', currentBalance)

                    }
                    

            }}><b>Donate</b> to HyperMask Developers</button>

            { !web3.givenProvider ? null : <button style={{ background: '#f76c20', float: 'right' }} onClick={async () => {
                let nativeWeb3 = new Web3(web3.givenProvider);

                let myAccounts = await nativeWeb3.eth.getAccounts();

                if(myAccounts.length === 0){
                    alert('Unable to determine your MetaMask wallet address. Please unlock your wallet and try again. ')
                    return
                }
                // console.log(nativeWeb3)
                let wallet = await getWallet()
                let currentBalance = BN(await web3.eth.getBalance(wallet.getAddressString(), 'pending'));

                let txObj = {
                    from: wallet.getAddressString(),
                    to: myAccounts[0],
                    value: currentBalance
                }
                txObj = await fixTx(txObj);
                let gasValue = BN(txObj.gasPrice).mul(BN(txObj.gas))
                txObj.value = currentBalance.sub(gasValue)
                

                if(confirm(`Do you want to transfer ${web3.utils.fromWei(currentBalance, 'ether')
                    } ETH to your MetaMask wallet (${wallet.getAddressString()})?\n\n${
                    web3.utils.fromWei(gasValue, 'ether')} ETH (${
                    (gasValue.mul(BN(10000) ).div(currentBalance).toNumber() / 100).toFixed(2)
                    }%) will be lost to transaction fees.`)){

                    Event('Transfer MetaMask (Sent)', currentBalance)

                    const tx = new EthereumTx(txObj)
                    tx.sign(wallet.getPrivateKey())
                    const serializedTx = tx.serialize()
                    const signedTx = ethUtil.bufferToHex(serializedTx);

                    web3.eth.sendSignedTransaction(signedTx)
                        .on('transactionHash', () => {
                            setTimeout(updateDashboard, 500)
                            alert('Transfer complete!')
                        })
                        .on('receipt', () => setTimeout(updateDashboard, 500))
                        .on('confirmation', () => setTimeout(updateDashboard, 500))
                        .on('error', error => alert(error))


                }else{
                    Event('Transfer MetaMask (Cancel)', currentBalance)

                }
                

            }}><b>Transfer</b> to {/Metamask/.test(web3.givenProvider.constructor.name) ? 'MetaMask' : 'Native'} Wallet</button>}
            </div>}

            <div className='caveat'>
                Transferring your account balance does not automatically transfer ERC20 tokens and other account-linked
                crypto assets, if you have any of them you must manually export & import the HyperMask private key. 
            </div>
        </div>

        <div className="block">
            <div>
                <label>
                 <input type="checkbox" 
                    checked={!!localStorage.requireIdentityApproval} 
                    onChange={e => {
                        localStorage.requireIdentityApproval = e.target.checked ? 'true' : '';
                        setState({})
                    } }/> 
                 Require approval before sharing identity with decentralized apps</label>
            </div>
            <div className='caveat'>
                By default, the public account address for your HyperMask Ethereum wallet is automatically to any decentralized app. 
                This is the same behavior of the MetaMask browser extension, but this means that any website can read your 
                pseudonymous transaction history and account balance. 
                If this box is checked, HyperMask shares no information with apps until you explicitly agree to.
            </div>

            <div>
                <label>
                 <input type="checkbox" 
                    checked={!!localStorage.disableAnalytics} 
                    onChange={e => {
                        localStorage.disableAnalytics = e.target.checked ? 'true' : '';
                        setState({})
                    } }/> 
                 Disable Google Analytics</label>
            </div>
            <div className='caveat'>
                By default, Google Analytics is used to collect anonymous usage information about HyperMask. 
                If this box is checked, HyperMask will not report any analytics information. 
            </div>
        </div>
    </div>
}



ReactDOM.render(<App />, document.getElementById('root'))


