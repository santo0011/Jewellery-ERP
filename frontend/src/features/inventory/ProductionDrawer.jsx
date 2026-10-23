import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Alert, Box, Button, Divider, IconButton, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { decimalToScaledInt, formatINR, formatWeight, METAL_POOL_KINDS, toPaise } from '@jerp/shared';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import FormDrawer from '../../components/FormDrawer.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import ItemPicker from '../items/ItemPicker.jsx';
import { purityLabel } from '../products/productForm.js';
import { useCreateProductionMutation } from './inventoryApi.js';

const inr = (p) => formatINR(p, { decimals: 0 });
const kindLabel = (k) => METAL_POOL_KINDS.find((x) => x.value === k)?.label ?? k;
const metalName = (m) => m.charAt(0).toUpperCase() + m.slice(1);
const poolKey = (p) => `${p.metal}|${p.purity}|${p.kind}`;
const mgOf = (v) => {
  try {
    return v ? (decimalToScaledInt(v, 3) ?? 0) : 0;
  } catch {
    return 0;
  }
};
const paiseOf = (v) => {
  try {
    return v ? (toPaise(v) ?? 0) : 0;
  } catch {
    return 0;
  }
};

function SectionTitle({ n, title, hint }) {
  return (
    <Box sx={{ mb: 1.25 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {n}. {title}
      </Typography>
      {hint && (
        <Typography variant="caption" color="textSecondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Make jewellery from the raw metal stock: the metal used (taken out of the metal stock at its average cost) and the
 * pieces made (added to Products, ready to sell). Their cost is the metal's cost plus the making charge, by weight.
 */
export default function ProductionDrawer({ open, onClose, pools = [] }) {
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const branches = session?.branches ?? [];
  const [branchId, setBranchId] = useState('');
  const [metal, setMetal] = useState([]); // [{ key, pool, weight }]
  const [pieces, setPieces] = useState([]); // [{ key, item, weight, huid }]
  const [making, setMaking] = useState('');
  const [mode, setMode] = useState('cash');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [create, { isLoading }] = useCreateProductionMutation();

  useEffect(() => {
    if (!open) return;
    const b = activeBranchId ?? branches[0]?.id ?? '';
    setBranchId(b);
    setMetal([]);
    setPieces([]);
    setMaking('');
    setMode('cash');
    setNote('');
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const here = useMemo(() => pools.filter((p) => String(p.branch?.id) === String(branchId) && p.grossMg > 0), [pools, branchId]);
  const poolOf = (key) => here.find((p) => poolKey(p) === key);
  const metalRows = metal.map((m) => {
    const pool = poolOf(m.key);
    const mg = mgOf(m.weight);
    const cost = pool?.valuePaise != null && pool.grossMg > 0 ? Math.round((pool.valuePaise * mg) / pool.grossMg) : null;
    return { ...m, pool, mg, cost };
  });
  const metalCost = metalRows.every((r) => r.cost != null) ? metalRows.reduce((n, r) => n + r.cost, 0) : null;
  const makingPaise = paiseOf(making);
  const usedMg = metalRows.reduce((n, r) => n + r.mg, 0);
  const madeMg = pieces.reduce((n, p) => n + mgOf(p.weight), 0);

  const submit = async () => {
    const e = {};
    if (!metalRows.length) e.metal = 'Add the metal used';
    metalRows.forEach((r, i) => {
      if (!r.pool) e[`m${i}`] = 'Pick the metal';
      else if (!(r.mg > 0)) e[`mw${i}`] = 'Enter weight';
      else if (r.mg > r.pool.grossMg) e[`mw${i}`] = `Only ${formatWeight(r.pool.grossMg)} in stock`;
    });
    if (!pieces.length) e.pieces = 'Add the pieces made';
    pieces.forEach((p, i) => {
      if (!(mgOf(p.weight) > 0)) e[`pw${i}`] = 'Enter weight';
      if (p.huid && !/^[A-Za-z0-9]{6}$/.test(p.huid)) e[`ph${i}`] = '6 letters/digits';
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      const res = await create({
        branchId,
        metalUsed: metalRows.map((r) => ({ metal: r.pool.metal, purity: r.pool.purity, kind: r.pool.kind, grossWeightMg: r.mg })),
        pieces: pieces.map((p) => ({ itemId: p.item.id, grossWeightMg: mgOf(p.weight), ...(p.huid && { huid: p.huid.toUpperCase() }) })),
        makingPaise,
        ...(makingPaise > 0 && { makingMode: mode }),
        note: note.trim() || null,
      }).unwrap();
      toast.success(`${res.productionNo}: ${res.pieces.length} piece${res.pieces.length === 1 ? '' : 's'} added to Products`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <FormDrawer
      open={open}
      title="Make jewellery"
      subtitle="Metal comes out of the raw stock; the pieces go into Products, ready to sell."
      onClose={onClose}
      onSubmit={(ev) => {
        ev?.preventDefault?.();
        submit();
      }}
      submitting={isLoading}
      submitLabel="Make & add to stock"
      width={640}
    >
      <Stack spacing={2.5}>
        {branches.length > 1 && (
          <TextField select label="Branch" value={branchId} onChange={(e) => (setBranchId(e.target.value), setMetal([]))}>
            {branches.map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>
        )}

        <Box>
          <SectionTitle n={1} title="Metal used" hint="From this branch’s raw metal stock, at what it cost on average." />
          {!here.length ? (
            <Alert severity="info" variant="outlined">
              No raw metal at this branch. Buy bullion or old gold on a purchase bill (Loose metal), then come back.
            </Alert>
          ) : (
            <Stack spacing={1.25}>
              {metalRows.map((r, i) => (
                <Stack key={r.key + i} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <TextField
                    select
                    label="Metal"
                    value={r.key}
                    onChange={(e) => setMetal((list) => list.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                    error={Boolean(errors[`m${i}`])}
                    helperText={errors[`m${i}`]}
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {here.map((p) => (
                      <MenuItem key={poolKey(p)} value={poolKey(p)}>
                        {metalName(p.metal)} {purityLabel(p.metal, p.purity)} · {kindLabel(p.kind)} · {formatWeight(p.grossMg)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Weight"
                    value={r.weight}
                    onChange={(e) => setMetal((list) => list.map((x, j) => (j === i ? { ...x, weight: e.target.value.replace(/[^\d.]/g, '') } : x)))}
                    error={Boolean(errors[`mw${i}`])}
                    helperText={errors[`mw${i}`] ?? (r.cost != null && r.mg ? inr(r.cost) : ' ')}
                    sx={{ width: { xs: 110, sm: 140 }, flexShrink: 0 }}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">g</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                  />
                  <IconButton onClick={() => setMetal((list) => list.filter((_, j) => j !== i))} aria-label="Remove metal" sx={{ mt: 0.5 }}>
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button variant="outlined" color="secondary" startIcon={<AddRoundedIcon />} onClick={() => setMetal((list) => [...list, { key: poolKey(here[0]), weight: '' }])} sx={{ alignSelf: 'flex-start' }}>
                Add metal
              </Button>
              {errors.metal && (
                <Typography variant="caption" color="error">
                  {errors.metal}
                </Typography>
              )}
            </Stack>
          )}
        </Box>

        <Box>
          <SectionTitle n={2} title="Pieces made" hint="Pick a saved item for each piece, then its weight (and HUID if hallmarked)." />
          <Stack spacing={1.25}>
            {pieces.map((p, i) => (
              <Stack key={p.key} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1, minWidth: 0, pt: 0.75 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {i + 1}. {p.item.name}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" noWrap sx={{ display: 'block' }}>
                    {p.item.purityLabel ?? `${metalName(p.item.metal)} ${purityLabel(p.item.metal, p.item.purity)}`}
                  </Typography>
                </Box>
                <TextField
                  label="Weight"
                  value={p.weight}
                  onChange={(e) => setPieces((list) => list.map((x, j) => (j === i ? { ...x, weight: e.target.value.replace(/[^\d.]/g, '') } : x)))}
                  error={Boolean(errors[`pw${i}`])}
                  helperText={errors[`pw${i}`] ?? ' '}
                  sx={{ width: { xs: 100, sm: 120 }, flexShrink: 0 }}
                  slotProps={{ input: { endAdornment: <InputAdornment position="end">g</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                />
                <TextField
                  label="HUID"
                  value={p.huid}
                  onChange={(e) => setPieces((list) => list.map((x, j) => (j === i ? { ...x, huid: e.target.value.toUpperCase().slice(0, 6) } : x)))}
                  error={Boolean(errors[`ph${i}`])}
                  helperText={errors[`ph${i}`] ?? ' '}
                  sx={{ width: { xs: 90, sm: 110 }, flexShrink: 0 }}
                />
                <IconButton onClick={() => setPieces((list) => list.filter((_, j) => j !== i))} aria-label={`Remove ${p.item.name}`} sx={{ mt: 0.5 }}>
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <ItemPicker onPick={(item) => setPieces((list) => [...list, { key: `${item.id}-${Date.now()}`, item, weight: '', huid: '' }])} label="Add a piece — search items" />
            {errors.pieces && (
              <Typography variant="caption" color="error">
                {errors.pieces}
              </Typography>
            )}
          </Stack>
        </Box>

        <Box>
          <SectionTitle n={3} title="Making charge" hint="What the karigar was paid for this work (optional). It adds to the pieces’ cost." />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
            <TextField label="Making charge" value={making} onChange={(e) => setMaking(e.target.value.replace(/[^\d.]/g, ''))} slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} sx={{ flex: 1 }} />
            {makingPaise > 0 && (
              <ToggleButtonGroup exclusive size="small" value={mode} onChange={(e, v) => v && setMode(v)} sx={{ flexShrink: 0, alignSelf: { sm: 'center' } }}>
                <ToggleButton value="cash">Cash</ToggleButton>
                <ToggleButton value="upi">UPI</ToggleButton>
                <ToggleButton value="bank">Bank</ToggleButton>
              </ToggleButtonGroup>
            )}
          </Stack>
          <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} sx={{ mt: 1.25 }} slotProps={{ htmlInput: { maxLength: 300 } }} />
        </Box>

        {(metalRows.length > 0 || pieces.length > 0) && (
          <Box sx={{ p: 2, borderRadius: 2.5, border: 1, borderColor: 'rgba(var(--brand-rgb), 0.3)', bgcolor: 'rgba(var(--brand-rgb), 0.05)' }}>
            {[
              ['Metal used', usedMg ? formatWeight(usedMg) : '—'],
              ['Pieces made', `${pieces.length} · ${madeMg ? formatWeight(madeMg) : '—'}`],
              ...(metalCost != null ? [['Metal cost', inr(metalCost)], ['Making charge', inr(makingPaise)]] : []),
            ].map(([k, v]) => (
              <Stack key={k} direction="row" sx={{ justifyContent: 'space-between', py: 0.35 }}>
                <Typography variant="body2" color="textSecondary">
                  {k}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {v}
                </Typography>
              </Stack>
            ))}
            {metalCost != null && (
              <>
                <Divider sx={{ my: 0.75 }} />
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Cost of the pieces
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: 'var(--brand-strong)', fontVariantNumeric: 'tabular-nums' }}>
                    {inr(metalCost + makingPaise)}
                  </Typography>
                </Stack>
              </>
            )}
            {madeMg > usedMg && usedMg > 0 && (
              <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', mt: 0.75 }}>
                The pieces weigh more than the metal used — check the weights (stones count in a piece’s weight).
              </Typography>
            )}
          </Box>
        )}
      </Stack>
    </FormDrawer>
  );
}
