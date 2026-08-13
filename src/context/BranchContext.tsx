import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface BranchContextType {
  selectedBranch: string;
  setSelectedBranch: (branch: string) => void;
  allowedBranches: string[];
  canSwitchBranch: boolean;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const [selectedBranch, setSelectedBranchState] = useState<string>(() => {
    return localStorage.getItem('brims_selected_branch') || "";
  });

  const allowedBranches = React.useMemo(() => {
    if (!user) return [];
    const roleUpper = (user.role || "").toUpperCase();
    const emailLower = (user.email || "").toLowerCase();
    if (roleUpper === 'ADMIN' || emailLower === 'shakshay04@gmail.com') {
      return ["Masulkhana", "Baddi"];
    }
    if (user.multiBranchAccess) {
      return user.allowedBranches || ["Masulkhana", "Baddi"];
    }
    return user.allowedBranches || [user.defaultBranch || "Masulkhana"];
  }, [user]);

  const canSwitchBranch = React.useMemo(() => {
    if (!user) return false;
    const roleUpper = (user.role || "").toUpperCase();
    const emailLower = (user.email || "").toLowerCase();
    return roleUpper === 'ADMIN' || emailLower === 'shakshay04@gmail.com' || !!user.multiBranchAccess;
  }, [user]);

  // Set default branch on login / user change
  useEffect(() => {
    if (loading) return; // Wait until authentication check is finished/settled to avoid wiping selected branch during reload

    if (user) {
      const savedBranch = localStorage.getItem('brims_selected_branch');
      
      let defaultBranch = user.defaultBranch || "Masulkhana";
      // If user only belongs to one branch, they MUST only access that branch
      if (!canSwitchBranch && allowedBranches.length > 0) {
        defaultBranch = allowedBranches[0];
      }

      const isSavedBranchValid = savedBranch && allowedBranches.includes(savedBranch);
      const choice = isSavedBranchValid ? (savedBranch as string) : defaultBranch;
      
      setSelectedBranchState(choice);
      localStorage.setItem('brims_selected_branch', choice);
    } else {
      setSelectedBranchState("");
      localStorage.removeItem('brims_selected_branch');
    }
  }, [user, loading, allowedBranches, canSwitchBranch]);

  const setSelectedBranch = (branch: string) => {
    if (!allowedBranches.includes(branch)) {
      console.warn(`Attempted to set unallowed branch: ${branch}`);
      return;
    }
    setSelectedBranchState(branch);
    localStorage.setItem('brims_selected_branch', branch);
    // Reload dynamically to safely refresh all query states across all views
    window.location.reload();
  };

  return (
    <BranchContext.Provider value={{ selectedBranch, setSelectedBranch, allowedBranches, canSwitchBranch }}>
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (!context) throw new Error('useBranch must be used within BranchProvider');
  return context;
};
