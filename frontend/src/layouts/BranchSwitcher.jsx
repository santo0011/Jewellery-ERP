import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import { Button, Divider, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { allBranchesSelected, branchSelected } from '../store/authSlice.js';

/**
 * The navbar branch filter. Options: Head Office (the default), All branches, then each branch.
 * Choosing a branch shows its data on list pages and makes it the working branch; "All branches" shows every
 * branch on list pages while the head office stays the working branch. `allowAll={false}` (dashboard, new bill)
 * offers single branches only, since those pages work on one branch.
 */
export default function BranchSwitcher({ branches, allowAll = true }) {
  const dispatch = useDispatch();
  const activeId = useSelector((s) => s.auth.activeBranchId);
  const view = useSelector((s) => s.auth.branchView);
  const [anchor, setAnchor] = useState(null);

  if (!branches.length) return null;

  const headOffice = branches.find((b) => b.isHeadOffice);
  const others = branches.filter((b) => b !== headOffice);
  const canAll = allowAll && branches.length > 1;
  const showingAll = canAll && view === 'all';
  const active = branches.find((b) => b.id === activeId);
  const label = showingAll ? 'All branches' : (active?.name ?? 'Select branch');
  const close = () => setAnchor(null);
  const pick = (id) => {
    dispatch(branchSelected(id));
    close();
  };
  const isOn = (b) => !showingAll && b.id === activeId;

  return (
    <>
      <Button
        color="secondary"
        variant="outlined"
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={showingAll ? <HubOutlinedIcon fontSize="small" /> : <AccountTreeOutlinedIcon fontSize="small" />}
        endIcon={branches.length > 1 ? <ExpandMoreRoundedIcon /> : null}
        disabled={branches.length < 2}
        sx={{ borderColor: 'divider', maxWidth: { xs: 160, sm: 240 }, minHeight: 36, '& .MuiButton-startIcon': { color: 'primary.dark' } }}
        aria-label="Branch filter"
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} slotProps={{ paper: { sx: { minWidth: 220 } } }}>
        {headOffice && (
          <MenuItem selected={isOn(headOffice)} onClick={() => pick(headOffice.id)}>
            <ListItemIcon>{isOn(headOffice) && <CheckRoundedIcon fontSize="small" color="primary" />}</ListItemIcon>
            <ListItemText primary={headOffice.name} secondary="Head office" />
          </MenuItem>
        )}
        {canAll && (
          <MenuItem
            selected={showingAll}
            onClick={() => {
              dispatch(allBranchesSelected(headOffice?.id ?? activeId));
              close();
            }}
          >
            <ListItemIcon>{showingAll && <CheckRoundedIcon fontSize="small" color="primary" />}</ListItemIcon>
            <ListItemText primary="All branches" secondary="Every branch together" />
          </MenuItem>
        )}
        {others.length > 0 && <Divider />}
        {others.map((b) => (
          <MenuItem key={b.id} selected={isOn(b)} onClick={() => pick(b.id)}>
            <ListItemIcon>{isOn(b) && <CheckRoundedIcon fontSize="small" color="primary" />}</ListItemIcon>
            <ListItemText primary={b.name} secondary={b.code} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
