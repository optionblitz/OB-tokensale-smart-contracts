// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";

contract Mocktion is ChainlinkClient {
    using Chainlink for Chainlink.Request;
  
    uint256 public price;
    uint256 public history;
    uint256 public result;
    
    address public oracle;
    bytes32 public jobId;
    uint256 public fee;

    struct Bet {
        address trader;
        uint investment;
        uint payoff;
        string symbol;
        uint timeOpen;
        uint priceOpen;
        uint priceClose;
        uint min;
        uint max;
        string status;
    }

    mapping(uint => Bet) public bets;
    uint public betId;
    
    constructor() {
        //For Arbitrum testnet
        //setChainlinkToken(0x615fBe6372676474d9e6933d310469c9b68e9726);
        //For Rinkeby
        setPublicChainlinkToken();
        oracle = 0xA010a31D5B53d9a2a7aA2b689a324B580dC1aab8;
        fee = 0; // (Varies by network and job)
    }

    function stringToBytes32(string memory source) public pure returns (bytes32 _result) {
        bytes memory tempEmptyStringTest = bytes(source);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }

        assembly {
            _result := mload(add(source, 32))
        }
    }

    function setJobId(string memory _jobId) public {
        jobId = stringToBytes32(_jobId);
    }

    function setOracle(address _oracle) public {
        oracle = _oracle;
    }
    
    function betAdd(
        string memory market,
        string memory symbol,
        uint investment
    ) 
        public returns (bytes32 requestId) 
    {
        Chainlink.Request memory request = buildChainlinkRequest(jobId, address(this), this._betAdd.selector);
        
        request.add("method", "quote");
        request.add("market", market); 
        request.add("symbol", symbol); 
        request.addUint("investment", investment); 
        request.addBytes("trader", abi.encodePacked(msg.sender));

        // Sends the request
        return sendChainlinkRequestTo(oracle, request, fee);
    }
    function betClose(
        string memory market,
        string memory symbol,
        uint id
    ) 
        public returns (bytes32 requestId) 
    {
        Chainlink.Request memory request = buildChainlinkRequest(jobId, address(this), this._betClose.selector);
        
        request.add("method", "quote");
        request.add("market", market); 
        request.add("symbol", symbol); 
        request.addUint("betId", id);

        // Sends the request
        return sendChainlinkRequestTo(oracle, request, fee);
    }
    function betCloseTouch(
        string memory market, 
        string memory symbol,
        uint id
    )
        public returns (bytes32 requestId) 
    {
        Chainlink.Request memory request = buildChainlinkRequest(jobId, address(this), this._betCloseTouch.selector);
        Bet storage bet = bets[id];

        request.add("method", "minmax");
        request.add("market", market); 
        request.add("symbol", symbol); 
        request.addUint("from", bet.timeOpen);
        request.addUint("to", block.timestamp);
        request.addUint("betId", id);
        // Sends the request
        return sendChainlinkRequestTo(oracle, request, fee);
    }
    /**
     * Receive the response in the form of uint256
     */ 
    function _betAdd(
        bytes32 _requestId,
        uint _price,
        uint _investment,
        address _trader,
        string memory _symbol
    ) 
        public recordChainlinkFulfillment(_requestId)
    {
        bets[betId] = Bet(
            _trader,
            _investment,
            0,
            _symbol,
            block.timestamp,
            _price,
            0,
            0,
            0,
            "In progress"
        );
        betId++;
    }
    function _betClose(bytes32 _requestId, uint _price, uint id) public recordChainlinkFulfillment(_requestId)
    {
        Bet storage bet = bets[id];
        bet.priceClose = _price;
        uint amount = bet.investment/(bet.priceOpen * 1000);
        if (_price > bet.priceOpen) {
            bet.status = "win";
            bet.payoff = (amount * _price) - bet.investment;
        }
        if (_price < bet.priceOpen)
           bet.status = "loss";
        if (_price == bet.priceOpen)
            bet.status = "draw";
    }
    function _betCloseTouch(
        bytes32 _requestId,
        uint _price,
        uint _min, 
        uint _max, 
        uint id
    ) 
        public recordChainlinkFulfillment(_requestId)
    {
        Bet storage bet = bets[id];
        bet.priceClose = _price;
        bet.min = _min;
        bet.max = _max;

        uint amount = bet.investment/(bet.priceOpen * 1000);
        if (_price > bet.priceOpen) {
            bet.status = "win";
            bet.payoff = (amount * _price) - bet.investment;
        }
        if (_price < bet.priceOpen)
           bet.status = "loss";
        if (_price == bet.priceOpen)
            bet.status = "draw";
    }
}
