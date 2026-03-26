import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { ethers } from 'ethers';
import artifacts from './HybridVoting.json'

// ============= CONSTANTS =============
const CONTRACT_ADDRESS = "0xBCa88108206BA6395Ed921dC4c50759Cf935307B";
const REQUIRED_NETWORK_ID = 11155111;

const CONTRACT_ABI = artifacts.abi

const WorkflowStatus = {
  0: "Registering Voters",
  1: "Proposals Registration",
  2: "Voting Session Started",
  3: "Voting Session Ended",
  4: "Votes Tallied"
};

// ============= WEB3 CONTEXT ============
const Web3Context = createContext();

const Web3Provider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [chainId, setChainId] = useState(null);

 const connectWallet = async () => {
  try {
    if (!window.ethereum) {
      alert('Please install MetaMask!');
      return;
    }

    const web3Provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (accounts.length === 0) {
      alert('No account selected');
      return;
    }

    const signer = await web3Provider.getSigner();
    const address =await signer.getAddress();   
    const network = await web3Provider.getNetwork();
    console.log("Address: ", address);

    if (Number(network.chainId) !== REQUIRED_NETWORK_ID) {
      alert('Please switch to the Sepolia network!');
      return;
    }

    setProvider(web3Provider);
    setAccount(address);
    setChainId(Number(network.chainId));

    const votingContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    setContract(votingContract);

    const owner = await votingContract.owner();
    setIsOwner(owner.toLowerCase() === address.toLowerCase());
  } catch (error) {
    console.error('Error connecting wallet:', error);
    if (error.code === 4001) alert('Connection request rejected by user');
    else alert('Failed to connect wallet: ' + error.message);
  }
};


  const disconnectWallet = () => {
    setAccount(null);
    setContract(null);
    setIsOwner(false);
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) disconnectWallet();
        else connectWallet();
      });
      window.ethereum.on('chainChanged', () => window.location.reload());
    }
  }, []);

  return (
    <Web3Context.Provider value={{ account, provider, contract, isOwner, chainId, connectWallet, disconnectWallet }}>
      {children}
    </Web3Context.Provider>
  );
};

const useWeb3 = () => useContext(Web3Context);

// ============= CUSTOM HOOK =============
const useContract = () => {
  const { contract, account, isOwner } = useWeb3();
  const [workflowStatus, setWorkflowStatus] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [voterInfo, setVoterInfo] = useState(null);
  const [votingStatus, setVotingStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchWorkflowStatus = useCallback(async () => {
    if (!contract) return;
    try {
      const status = await contract.workflowStatus();
      setWorkflowStatus(Number(status));
    } catch (error) {
      console.error('Error:', error);
    }
  }, [contract]);

  const fetchProposals = useCallback(async () => {
    if (!contract) return;
    try {
      const count = await contract.getProposalsCount();
      const proposalsArray = [];
      for (let i = 0; i < Number(count); i++) {
        const proposal = await contract.getProposal(i);
        proposalsArray.push({
          id: i,
          description: proposal.description,
          voteCount: Number(proposal.voteCount)
        });
      }
      setProposals(proposalsArray);
    } catch (error) {
      console.error('Error:', error);
    }
  }, [contract]);

  const fetchVoterInfo = useCallback(async () => {
    if (!contract || !account) return;
    try {
      const voter = await contract.getVoter(account);
      setVoterInfo({
        isRegistered: voter.isRegistered,
        hasVoted: voter.hasVoted,
        votedProposalId: Number(voter.votedProposalId)
      });
    } catch (error) {
      console.error('Error:', error);
    }
  }, [contract, account]);

  const fetchVotingStatus = useCallback(async () => {
    if (!contract) return;
    try {
      const status = await contract.getVotingStatus();
      setVotingStatus({
        workflowStatus: Number(status[0]),
        startTime: Number(status[1]),
        endTime: Number(status[2]),
        remaining: Number(status[3])
      });
    } catch (error) {
      console.error('Error:', error);
    }
  }, [contract]);

  const registerVoter = async (voterAddress) => {
    if (!contract || !isOwner) return false;
    setLoading(true);
    try {
      const tx = await contract.registerVoter(voterAddress);
      await tx.wait();
      alert('Voter registered successfully!');
      return true;
    } catch (error) {
      alert(error.reason || 'Failed to register voter');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const addProposal = async (description) => {
    if (!contract || !isOwner) return false;
    setLoading(true);
    try {
      const tx = await contract.addProposal(description);
      await tx.wait();
      alert('Proposal added!');
      await fetchProposals();
      return true;
    } catch (error) {
      alert(error.reason || 'Failed to add proposal');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const startProposalRegistration = async () => {
    if (!contract || !isOwner) return false;
    setLoading(true);
    try {
      const tx = await contract.startProposalRegistration();
      await tx.wait();
      alert('Proposal registration started!');
      await fetchWorkflowStatus();
      return true;
    } catch (error) {
      alert(error.reason || 'Failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const startVotingSession = async (durationInSeconds) => {
    if (!contract || !isOwner) return false;
    setLoading(true);
    try {
      const tx = await contract.startVotingSession(durationInSeconds);
      await tx.wait();
      alert('Voting started!');
      await fetchWorkflowStatus();
      await fetchVotingStatus();
      return true;
    } catch (error) {
      alert(error.reason || 'Failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const endVotingSession = async () => {
    if (!contract || !isOwner) return false;
    setLoading(true);
    try {
      const tx = await contract.endVotingSession();
      await tx.wait();
      alert('Voting ended!');
      await fetchWorkflowStatus();
      return true;
    } catch (error) {
      alert(error.reason || 'Failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const resetVoting = async ()=>{
    console.log("Running");
    if(!contract|| !isOwner) return false;
    setLoading(true);
    try{
      const tx = await contract.resetVoting();
      await tx.wait();
      alert("Voting reset");
      await fetchWorkflowStatus();
      await fetchProposals();
      await fetchVotingStatus();
      await fetchVoterInfo();
      return true;

    } catch(error) {
      alert(error.reason|| "Failed Voting resetting");
      return false;
    }finally {
      setLoading(false);
    }
  };

  const tallyVotes = async () => {
    if (!contract || !isOwner) return false;
    setLoading(true);
    try {
      const tx = await contract.tallyVotes();
      await tx.wait();
      alert('Votes tallied!');
      await fetchWorkflowStatus();
      return true;
    } catch (error) {
      alert(error.reason || 'Failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const vote = async (proposalId) => {
    if (!contract) return false;
    setLoading(true);
    try {
      const tx = await contract.vote(proposalId);
      await tx.wait();
      alert('Vote submitted!');
      await fetchVoterInfo();
      await fetchProposals();
      return true;
    } catch (error) {
      alert(error.reason || 'Failed to vote');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getWinner = async () => {
    if (!contract) return null;
    try {
      const winner = await contract.getWinner();
      return { winnerName: winner.winnerName, maxVotes: Number(winner.maxVotes) };
    } catch (error) {
      return null;
    }
  };

  useEffect(() => {
    if (contract) {
      fetchWorkflowStatus();
      fetchProposals();
      fetchVotingStatus();
      if (account) fetchVoterInfo();
    }
  }, [contract, account]);

  return {
    workflowStatus,
    proposals,
    voterInfo,
    votingStatus,
    loading,
    registerVoter,
    addProposal,
    startProposalRegistration,
    startVotingSession,
    endVotingSession,
    tallyVotes,
    vote,
    getWinner,
    resetVoting
  };
};

// ============= HEADER COMPONENT ============
const Header = ({ workflowStatus }) => {
  const { account, isOwner, connectWallet, disconnectWallet } = useWeb3();

  return (
    <header className="backdrop-blur bg-gradient-to-r from-indigo-600/10 to-purple-700/8 border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="text-2xl">🗳️</div>
          <div>
            <h1 className="text-white text-lg font-semibold leading-tight">Hybrid Voting</h1>
            {workflowStatus !== null && (
              <div className="mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
                {WorkflowStatus[workflowStatus]}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {account ? (
            <>
              {isOwner && <span className="bg-yellow-300 text-amber-900 px-3 py-1 rounded-md font-bold text-sm">ADMIN PORTAL</span>}
              <div className="bg-white/5 px-3 py-2 rounded-md font-mono text-sm">{account.slice(0,6)}...{account.slice(-4)}</div>
              <button onClick={disconnectWallet} className="px-3 py-2 rounded-md border border-white/6 text-white/90 hover:bg-white/3 transition">
                Disconnect
              </button>
            </>
          ) : (
            <button onClick={connectWallet} className="px-4 py-2 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-95 transition">
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

// ============= ADMIN DASHBOARD ============
const AdminDashboard = () => {
  const { isOwner, account } = useWeb3();
  const { workflowStatus, proposals, loading, registerVoter, addProposal, startProposalRegistration, startVotingSession, endVotingSession, tallyVotes, resetVoting } = useContract();
  
  const [voterAddress, setVoterAddress] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [votingDuration, setVotingDuration] = useState({ days: 0, hours: 1, minutes: 0 });

  if (!account) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <h2 className="text-2xl font-semibold text-white">Please tryt connect your wallet</h2>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <h2 className="text-2xl font-semibold text-white">⛔ Access Denied</h2>
        <p className="text-sm text-slate-400 mt-2">Only the contract owner can access this dashboard</p>
      </div>
    );
  }

  const handleRegisterVoter = async (e) => {
    e.preventDefault();
    if (!voterAddress) return;
    const success = await registerVoter(voterAddress);
    if (success) setVoterAddress('');
  };

  const handleAddProposal = async (e) => {
    e.preventDefault();
    if (!proposalDescription) return;
    const success = await addProposal(proposalDescription);
    if (success) setProposalDescription('');
  };

  const handleStartVoting = async (e) => {
    e.preventDefault();
    const totalSeconds = (votingDuration.days * 86400) + (votingDuration.hours * 3600) + (votingDuration.minutes * 60);
    if (totalSeconds < 60) {
      alert('Duration must be at least 1 minute');
      return;
    }
    await startVotingSession(totalSeconds);
  };

  const canRegisterVoters = workflowStatus === 0;
  const canAddProposals = workflowStatus === 1;
  const canStartProposals = workflowStatus === 0;
  const canStartVoting = workflowStatus === 1;
  const canEndVoting = workflowStatus === 2;
  const canTallyVotes = workflowStatus === 3;
  const canResetVoting = workflowStatus === 4;

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between bg-white/5 p-5 rounded-xl border border-white/6">
        <div>
          <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
          <p className="text-sm text-slate-400 mt-1">Manage voters, proposals and the voting workflow.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600" />
          <div className="font-mono text-sm text-slate-300">{account}</div>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        <div className={`p-5 rounded-xl border border-white/6 bg-white/3 ${!canRegisterVoters ? 'opacity-60' : ''}`}>
          <h3 className="text-lg font-semibold text-white mb-3">📋 Register Voters</h3>
          <form onSubmit={handleRegisterVoter} className="flex flex-col gap-3">
            <input
              value={voterAddress}
              onChange={(e) => setVoterAddress(e.target.value)}
              placeholder="Voter Address (0x...)"
              disabled={!canRegisterVoters || loading}
              className="w-full px-3 py-2 rounded-lg bg-transparent border border-white/6 placeholder:text-slate-400 text-white"
            />
            <button type="submit" disabled={!canRegisterVoters || loading} className={`w-full px-3 py-2 rounded-lg font-semibold text-white ${canRegisterVoters && !loading ? 'bg-gradient-to-r from-indigo-500 to-purple-600' : 'bg-white/6 cursor-not-allowed'}`}>
              {loading ? 'Processing...' : 'Register Voter'}
            </button>
          </form>
          {!canRegisterVoters && <p className="text-sm text-slate-400 mt-3">Voter registration phase has ended</p>}
        </div>

        <div className="p-5 rounded-xl border border-white/6 bg-white/3">
          <h3 className="text-lg font-semibold text-white mb-3">🔄 Workflow Control</h3>
          <div className="flex flex-col gap-3">
            <button onClick={startProposalRegistration} disabled={!canStartProposals || loading} className={`px-4 py-2 rounded-lg font-medium ${canStartProposals && !loading ? 'border border-indigo-500 text-indigo-500' : 'bg-white/6 text-white/60 cursor-not-allowed'}`}>
              Start Proposal Registration
            </button>
            <button onClick={endVotingSession} disabled={!canEndVoting || loading} className={`px-4 py-2 rounded-lg font-medium ${canEndVoting && !loading ? 'bg-amber-500 text-white' : 'bg-white/6 text-white/60 cursor-not-allowed'}`}>
              End Voting Session
            </button>
            <button onClick={tallyVotes} disabled={!canTallyVotes || loading} className={`px-4 py-2 rounded-lg font-medium ${canTallyVotes && !loading ? 'bg-emerald-500 text-white' : 'bg-white/6 text-white/60 cursor-not-allowed'}`}>
              Tally Votes
            </button>
            <button onClick={resetVoting} disabled={!canResetVoting || loading} className={`px-4 py-2 rounded-lg font-medium ${canResetVoting && !loading ? 'bg-emerald-500 text-white' : 'bg-white/6 text-white/60 cursor-not-allowed'}`}>
              Reset Voting
            </button>
          </div>
        </div>

        <div className={`p-5 rounded-xl border border-white/6 bg-white/3 ${!canAddProposals ? 'opacity-60' : ''}`}>
          <h3 className="text-lg font-semibold text-white mb-3">📝 Add Proposals</h3>
          <form onSubmit={handleAddProposal} className="flex flex-col gap-3">
            <textarea
              value={proposalDescription}
              onChange={(e) => setProposalDescription(e.target.value)}
              placeholder="Proposal description..."
              disabled={!canAddProposals || loading}
              className="w-full px-3 py-2 rounded-lg bg-transparent border border-white/6 placeholder:text-slate-400 text-white min-h-[90px] resize-y"
            />
            <button type="submit" disabled={!canAddProposals || loading} className={`w-full px-3 py-2 rounded-lg font-semibold text-white ${canAddProposals && !loading ? 'bg-gradient-to-r from-indigo-500 to-purple-600' : 'bg-white/6 cursor-not-allowed'}`}>
              {loading ? 'Processing...' : 'Add Proposal'}
            </button>
          </form>
          {!canAddProposals && <p className="text-sm text-slate-400 mt-3">Not in proposal registration phase</p>}
        </div>

        <div className={`p-5 rounded-xl border border-white/6 bg-white/3 col-span-1 lg:col-span-3 ${!canStartVoting ? 'opacity-60' : ''}`}>
          <h3 className="text-lg font-semibold text-white mb-3">🚀 Start Voting</h3>
          <form onSubmit={handleStartVoting} className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-xs text-slate-400">Days</label>
              <input type="number" min="0" value={votingDuration.days} onChange={(e) => setVotingDuration({ ...votingDuration, days: parseInt(e.target.value) || 0 })} disabled={!canStartVoting || loading} className="w-full mt-1 px-3 py-2 rounded-lg bg-transparent border border-white/6 text-white" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Hours</label>
              <input type="number" min="0" max="23" value={votingDuration.hours} onChange={(e) => setVotingDuration({ ...votingDuration, hours: parseInt(e.target.value) || 0 })} disabled={!canStartVoting || loading} className="w-full mt-1 px-3 py-2 rounded-lg bg-transparent border border-white/6 text-white" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Minutes</label>
              <input type="number" min="0" max="59" value={votingDuration.minutes} onChange={(e) => setVotingDuration({ ...votingDuration, minutes: parseInt(e.target.value) || 0 })} disabled={!canStartVoting || loading} className="w-full mt-1 px-3 py-2 rounded-lg bg-transparent border border-white/6 text-white" />
            </div>
            <div className="col-span-3">
              <button type="submit" disabled={!canStartVoting || loading} className={`w-full px-4 py-2 rounded-lg font-semibold text-white ${canStartVoting && !loading ? 'bg-gradient-to-r from-indigo-500 to-purple-600' : 'bg-white/6 cursor-not-allowed'}`}>
                Start Voting
              </button>
            </div>
          </form>
        </div>

        <div className="p-5 rounded-xl border border-white/6 bg-white/3 col-span-1 lg:col-span-3">
          <h3 className="text-lg font-semibold text-white mb-3">📊 Current Proposals <span className="text-sm text-slate-400">({proposals.length})</span></h3>
          {proposals.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No proposals added yet</div>
          ) : (
            <div className="flex flex-col gap-3">
              {proposals.map((proposal) => (
                <div key={proposal.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/6">
                  <div>
                    <div className="text-sm font-semibold text-indigo-400">#{proposal.id}</div>
                    <div className="text-sm text-slate-300 mt-1">{proposal.description}</div>
                  </div>
                  <div className="text-sm font-semibold text-slate-100">{proposal.voteCount} votes</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

// ============= VOTER DASHBOARD ============
const VoterDashboard = () => {
  
  const { account } = useWeb3();
  const { workflowStatus, proposals, voterInfo, votingStatus, loading, vote, getWinner } = useContract();
  
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    if (votingStatus && votingStatus.remaining > 0) {
      const interval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        const remaining = votingStatus.endTime - now;
        setTimeRemaining(remaining > 0 ? remaining : 0);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [votingStatus]);

  useEffect(() => {
    if (workflowStatus === 4) {
      getWinner().then(setWinner);
    }
  }, [workflowStatus]);

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '0d 0h 0m 0s';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  };

  const handleVote = async () => {
    if (selectedProposal === null) return;
    const success = await vote(selectedProposal);
    if (success) setSelectedProposal(null);
  };

  if (!account) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <h2 className="text-2xl font-semibold text-white">👋 Welcome to Hybrid Voting</h2>
        <p className="text-slate-400 mt-2">Please connect your wallet to participate</p>
      </div>
    );
  }

  if (!voterInfo?.isRegistered) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <h2 className="text-2xl font-semibold text-white">⚠️ Not Registered</h2>
        <p className="text-slate-400 mt-2">You are not registered as a voter</p>
        <div className="mt-4 font-mono bg-white/3 inline-block px-3 py-2 rounded-md text-sm">{account}</div>
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 grid gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Voter Dashboard</h2>
        <div className={`px-3 py-1 rounded-md font-semibold ${voterInfo?.hasVoted ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
          {voterInfo?.hasVoted ? '✓ Vote Submitted' : '⏳ Pending Vote'}
        </div>
      </div>

      {workflowStatus === 2 && (
        <div className="rounded-xl p-5 text-center bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
          <h3 className="text-lg font-semibold">🕐 Time Remaining</h3>
          <div className="font-mono text-3xl font-bold mt-2">{formatTime(timeRemaining)}</div>
        </div>
      )}

      {workflowStatus === 0 && (
        <div className="rounded-xl p-6 text-center bg-white/3 border border-white/6">
          <h3 className="text-lg font-semibold text-white">📋 Registration Phase</h3>
          <p className="text-slate-400 mt-2">The admin is currently registering voters. Voting will begin soon.</p>
        </div>
      )}

      {workflowStatus === 1 && (
        <div className="rounded-xl p-6 text-center bg-white/3 border border-white/6">
          <h3 className="text-lg font-semibold text-white">📝 Proposal Registration Phase</h3>
          <p className="text-slate-400 mt-2">Proposals are being added. Voting will start after this phase.</p>
        </div>
      )}

      {workflowStatus === 2 && (
        <div className="rounded-xl p-6 bg-white/4 border border-white/6">
          {voterInfo?.hasVoted ? (
            <div className="text-center">
              <h3 className="text-xl font-semibold text-emerald-400">✅ Thank You for Voting!</h3>
              <p className="text-slate-300 mt-2">You voted for:</p>
              <div className="mt-4 p-4 rounded-lg bg-white/5">
                <strong className="text-indigo-400">Proposal #{voterInfo.votedProposalId}</strong>
                <p className="mt-2 text-slate-300">{proposals.find(p => p.id === voterInfo.votedProposalId)?.description}</p>
              </div>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-white">🗳️ Cast Your Vote</h3>
              <p className="text-slate-400 mt-2">Select a proposal and click Submit Vote</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {proposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    onClick={() => setSelectedProposal(proposal.id)}
                    className={`p-4 rounded-xl border transition cursor-pointer ${selectedProposal === proposal.id ? 'border-indigo-400 bg-indigo-50/5 shadow-lg' : 'border-white/6 bg-white/5 hover:translate-y-[-2px]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-indigo-300">Proposal #{proposal.id}</strong>
                      {selectedProposal === proposal.id && <span className="text-xs bg-indigo-500 text-white px-2 py-1 rounded-full font-semibold">✓ Selected</span>}
                    </div>
                    <p className="mt-3 text-slate-300 text-sm leading-relaxed">{proposal.description}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={handleVote}
                disabled={selectedProposal === null || loading}
                className={`mt-6 w-full px-4 py-3 rounded-xl font-semibold ${selectedProposal !== null && !loading ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : 'bg-white/6 text-white/50 cursor-not-allowed'}`}
              >
                {loading ? 'Submitting...' : 'Submit Vote'}
              </button>
            </>
          )}
        </div>
      )}

      {workflowStatus === 3 && (
        <div className="rounded-xl p-6 text-center bg-white/3 border border-white/6">
          <h3 className="text-lg font-semibold text-white">⏸️ Voting Ended</h3>
          <p className="text-slate-400 mt-2">The voting session has ended. Waiting for vote tallying...</p>
        </div>
      )}

      {workflowStatus === 4 && winner && (
        <div className="rounded-xl p-6 bg-white/4 border border-white/6">
          <h3 className="text-xl font-semibold text-white text-center">🏆 Final Results</h3>
          <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white text-center">
            <div className="inline-block bg-white/12 px-3 py-1 rounded-full text-xs font-semibold mb-2">WINNER</div>
            <h4 className="text-2xl font-bold">{winner.winnerName}</h4>
            <p className="mt-1 text-lg">{winner.maxVotes} votes</p>
          </div>

          <h4 className="mt-6 text-lg font-semibold text-white">All Proposals</h4>
          <div className="mt-4 flex flex-col gap-3">
            {proposals.sort((a, b) => b.voteCount - a.voteCount).map((proposal, index) => (
              <div key={proposal.id} className="flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-white/6">
                <div className="text-indigo-300 font-bold min-w-[44px]">#{index + 1}</div>
                <div className="flex-1">
                  <p className="font-medium text-slate-200">{proposal.description}</p>
                  <div className="mt-2 h-2 bg-white/6 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600" style={{ width: `${proposals.length > 0 ? (proposal.voteCount / Math.max(...proposals.map(p => p.voteCount))) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="font-semibold text-slate-100 min-w-[64px] text-right">{proposal.voteCount}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {proposals.length > 0 && workflowStatus !== 2 && workflowStatus !== 4 && (
        <div className="rounded-xl p-5 bg-white/4 border border-white/6">
          <h3 className="text-lg font-semibold text-white">📋 Current Proposals</h3>
          <div className="mt-3 grid gap-3">
            {proposals.map((proposal) => (
              <div key={proposal.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/6">
                <div className="text-indigo-400 font-bold min-w-[48px]">#{proposal.id}</div>
                <p className="text-slate-300">{proposal.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
};

// ============= MAIN APP ============
const App = () => {
  const { account, isOwner } = useWeb3();
  const { workflowStatus } = useContract();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-slate-100">
      <Header workflowStatus={workflowStatus} />

      <main className="py-8">
        {!account ? (
          <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2">
              <h1 className="text-4xl font-extrabold text-white">Welcome to <span className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">Hybrid Voting</span></h1>
              <p className="mt-3 text-slate-400 text-lg">A decentralized voting platform powered by blockchain technology. Transparent, secure and easy to use.</p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-white/4 border border-white/6">
                  <div className="text-2xl">🔒</div>
                  <h3 className="mt-3 font-semibold text-white">Secure</h3>
                  <p className="mt-1 text-slate-400 text-sm">Votes are recorded on the blockchain, ensuring transparency and immutability.</p>
                </div>

                <div className="p-4 rounded-xl bg-white/4 border border-white/6">
                  <div className="text-2xl">✅</div>
                  <h3 className="mt-3 font-semibold text-white">Verifiable</h3>
                  <p className="mt-1 text-slate-400 text-sm">Every vote can be verified and audited by anyone.</p>
                </div>

                <div className="p-4 rounded-xl bg-white/4 border border-white/6">
                  <div className="text-2xl">⚡</div>
                  <h3 className="mt-3 font-semibold text-white">Efficient</h3>
                  <p className="mt-1 text-slate-400 text-sm">Streamlined workflow from registration to results.</p>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl bg-white/6 border border-white/6 flex flex-col items-start justify-center">
              <h3 className="text-xl font-semibold text-white">Get started</h3>
              <p className="text-slate-400 mt-2">Connect your wallet to participate or to manage the election.</p>
              <div className="mt-4">
                <button className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold">Connect Wallet</button>
              </div>
            </div>
          </div>
        ) : (
          isOwner ? <AdminDashboard /> : <VoterDashboard />
        )}
      </main>

      <footer className="border-t border-white/6 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between text-sm text-slate-400">
          <div>© {new Date().getFullYear()} Hybrid Voting</div>
          <div>Built with ❤️ — Sepolia-ready</div>
        </div>
      </footer>
    </div>
  );
};

// ============= ROOT RENDER ============
const Root = () => {
  return (
    <Web3Provider>
      <App />
    </Web3Provider>
  );
};

export default Root;
