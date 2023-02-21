// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct Proposal {
  uint yes;
  uint no;
  bool closed;
}
contract TestDAO {
  address public token;

  mapping(uint => Proposal) proposals;
  event Passed(uint proposal, uint yes, uint total);
  event Rejected(uint proposal, uint no, uint total);

  constructor(address _token) { token = _token; }

  function vote(uint proposal, bool yes) external {
    require(IERC20(token).balanceOf(msg.sender) > 0, "not token holder");
    require(!proposals[proposal].closed, "closed");
    uint share = IERC20(token).balanceOf(msg.sender);
    uint total = IERC20(token).totalSupply();
    proposals[proposal].yes += yes ? share : 0;
    proposals[proposal].no += yes ? 0 : share;
    proposals[proposal].closed = proposals[proposal].yes > total/2 || proposals[proposal].no > total/2;
    if (proposals[proposal].yes > total / 2) {
      emit Passed(proposal, proposals[proposal].yes, total);
    }
    if (proposals[proposal].no > total / 2) {
      emit Passed(proposal, proposals[proposal].no, total);
    }

  }

}