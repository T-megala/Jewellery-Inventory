import { useEffect, useState } from 'react'
import {
  BRANCH_CHANGE_EVENT,
  getActiveBranch,
  getActiveBranchId,
  getOperationalBranchId,
  getOperationalBranchValue,
  getSessionBranches,
  isAllBranchesScope,
} from '../services/auth.js'

export function useBranchScope() {
  const [scope, setScope] = useState(() => ({
    activeBranchId: getActiveBranchId(),
    activeBranch: getActiveBranch(),
    operationalBranchId: getOperationalBranchId(),
    operationalValue: getOperationalBranchValue(),
    isAllBranches: isAllBranchesScope(),
    sessionBranches: getSessionBranches(),
  }))

  useEffect(() => {
    function syncScope() {
      setScope({
        activeBranchId: getActiveBranchId(),
        activeBranch: getActiveBranch(),
        operationalBranchId: getOperationalBranchId(),
        operationalValue: getOperationalBranchValue(),
        isAllBranches: isAllBranchesScope(),
        sessionBranches: getSessionBranches(),
      })
    }

    window.addEventListener(BRANCH_CHANGE_EVENT, syncScope)
    return () => window.removeEventListener(BRANCH_CHANGE_EVENT, syncScope)
  }, [])

  return scope
}
