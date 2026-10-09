import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { Button, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { branchSelected } from '../store/authSlice.js';

export default function BranchSwitcher({ branches }) {
  const dispatch = useDispatch();
  const activeId = useSelector((s) => s.auth.activeBranchId);
  const [anchor, setAnchor] = useState(null);
  const active = branches.find((b) => b.id === activeId);

  if (!branches.length) return null;

  return (
    <>
      <Button
        color="secondary"
        variant="outlined"
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={<AccountTreeOutlinedIcon fontSize="small" />}
        endIcon={branches.length > 1 ? <ExpandMoreRoundedIcon /> : null}
        disabled={branches.length < 2}
        sx={{ borderColor: 'divider', maxWidth: { xs: 160, sm: 240 }, minHeight: 36, '& .MuiButton-startIcon': { color: 'primary.dark' } }}
        aria-label="Switch branch"
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active?.name ?? 'Select branch'}</span>
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {branches.map((b) => (
          <MenuItem
            key={b.id}
            selected={b.id === activeId}
            onClick={() => {
              dispatch(branchSelected(b.id));
              setAnchor(null);
            }}
          >
            <ListItemIcon>{b.id === activeId && <CheckRoundedIcon fontSize="small" color="primary" />}</ListItemIcon>
            <ListItemText primary={b.name} secondary={b.code} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
