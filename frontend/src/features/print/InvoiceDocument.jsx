import { Box } from '@mui/material';
import { fonts } from '../../theme/tokens.js';
import { invoiceData } from './invoiceData.js';
import { PRINT_SIZES } from './printLayouts.js';
import { t } from '../../i18n/index.js';

const INK = '#171717';
const MUTED = '#5C5A55';
const RULE = '#E3DCC8';
const GOLD = 'var(--brand-strong)';
const GOLD_FILL = 'rgba(var(--brand-rgb), 0.10)';

const COPY_LABELS = [t('Original for buyer'), t('Duplicate'), t('Triplicate')];

/* ------------------------------------------------------------------ shared pieces (A4) */

function Logo({ src, size }) {
  if (!src) return null;
  return <Box component="img" src={src} alt="" sx={{ height: size, maxWidth: size * 2.6, objectFit: 'contain', display: 'block' }} />;
}

function SellerLines({ d, align = 'left' }) {
  const s = d.seller;
  return (
    <Box sx={{ color: MUTED, textAlign: align, lineHeight: 1.45 }}>
      {s.branchName && <div>{s.branchName}</div>}
      {s.fullAddress && <div>{s.fullAddress}</div>}
      {(s.phone || s.email) && <div>{[s.phone, s.email].filter(Boolean).join('  ·  ')}</div>}
      {s.gstin && <Box sx={{ color: INK, fontWeight: 700 }}>{t('GSTIN {{gstin}}', { gstin: s.gstin })}</Box>}
    </Box>
  );
}

function BillTo({ d, label = t('Bill to') }) {
  const c = d.customer;
  return (
    <Box sx={{ lineHeight: 1.45 }}>
      <Box sx={{ fontSize: '0.8em', letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED, fontWeight: 700, mb: '2pt' }}>{label}</Box>
      {c ? (
        <>
          <Box sx={{ fontWeight: 700, fontSize: '1.15em' }}>{c.name}</Box>
          <Box sx={{ color: MUTED }}>{[c.mobile, c.code].filter(Boolean).join('  ·  ')}</Box>
          {c.fullAddress && <Box sx={{ color: MUTED }}>{c.fullAddress}</Box>}
          {c.gstin && <div>{t('GSTIN {{gstin}}', { gstin: c.gstin })}</div>}
          {c.pan && <div>{t('PAN {{pan}}', { pan: c.pan })}</div>}
        </>
      ) : (
        <Box sx={{ fontWeight: 700 }}>{t('Walk-in customer')}</Box>
      )}
    </Box>
  );
}

function InvoiceMeta({ d, align = 'right' }) {
  return (
    <Box sx={{ textAlign: align, lineHeight: 1.5 }}>
      <Box sx={{ fontWeight: 700, fontSize: '1.25em' }}>{d.invoiceNo}</Box>
      <Box sx={{ color: MUTED }}>{d.date}</Box>
      {d.orderNo && <Box sx={{ color: MUTED }}>{t('Against order {{orderNo}}', { orderNo: d.orderNo })}</Box>}
      {d.placeOfSupply && <Box sx={{ color: MUTED }}>{t('Place of supply: {{placeOfSupply}}', { placeOfSupply: d.placeOfSupply })}</Box>}
    </Box>
  );
}

function itemMeta(i, opts) {
  return [i.sku, i.purity, opts.showHuid && i.huid && t('HUID {{huid}}', { huid: i.huid }), opts.showHsn && i.hsn && t('HSN {{hsn}}', { hsn: i.hsn })].filter(Boolean).join('  ·  ');
}

const COLUMNS = [
  { key: 'n', label: '#', align: 'left' },
  { key: 'item', label: t('Item'), align: 'left' },
  { key: 'weight', label: t('Weight') },
  { key: 'rate', label: t('Rate/g ₹') },
  { key: 'metal', label: t('Metal ₹') },
  { key: 'making', label: t('Making ₹') },
  { key: 'stone', label: t('Stone ₹') },
  { key: 'taxable', label: t('Amount ₹') },
];

/**
 * The A4 items table: one weight column (net, with gross and stone weight under it) and amounts without the ₹ sign,
 * so the item name keeps a readable width. Stone details and discounts go on a full-width line under the item.
 * `head` styles the header row, `zebra` shades every other item.
 */
function ItemsTable({ d, opts, head, zebra, serif }) {
  return (
    <Box
      component="table"
      sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': { py: '4pt', px: '4pt', verticalAlign: 'top' }, '& th:first-of-type, & td:first-of-type': { pl: '2pt', width: '5%' } }}
    >
      <thead>
        <Box component="tr" sx={head}>
          {COLUMNS.map((c) => (
            <Box
              component="th"
              key={c.key}
              sx={{ textAlign: c.align ?? 'right', fontWeight: 700, fontSize: '0.8em', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap', fontFamily: serif ? fonts.display : 'inherit' }}
            >
              {c.label}
            </Box>
          ))}
        </Box>
      </thead>
      {d.items.map((i, idx) => {
        const extras = [
          i.stones.length > 0 && t('Stones: {{stones}}', { stones: i.stones.map((s) => [s.label, s.weight, s.rate && `@ ${s.rate}`].filter(Boolean).join(' ')).join('  ·  ') }),
          i.other && t('Other charges {{other}}', { other: i.other }),
          i.discount && t('Discount − {{discount}}', { discount: i.discount }),
        ].filter(Boolean);
        const shade = { bgcolor: zebra && idx % 2 ? '#FAF8F2' : 'transparent', opacity: i.returned ? 0.55 : 1 };
        return (
          // One <tbody> per item keeps the item and its detail line on the same page.
          <Box component="tbody" key={i.n} sx={{ breakInside: 'avoid', borderBottom: `1px solid ${RULE}` }}>
            <Box component="tr" sx={shade}>
              <td>{i.n}</td>
              <Box component="td" sx={{ width: '34%' }}>
                <Box sx={{ fontWeight: 700 }}>
                  {i.name}
                  {i.returned ? t(' (returned)') : ''}
                </Box>
                <Box sx={{ color: MUTED, fontSize: '0.88em' }}>{itemMeta(i, opts)}</Box>
              </Box>
              <Num>
                <Box sx={{ fontWeight: 600 }}>{i.net}</Box>
                {opts.showWeightBreakup && (
                  <Box sx={{ color: MUTED, fontSize: '0.85em' }}>
                    {t('Gr {{gross}}', { gross: i.gross })}
                    {i.stoneWt ? t(' · St {{stoneWt}}', { stoneWt: i.stoneWt }) : ''}
                  </Box>
                )}
              </Num>
              <Num>{i.cells.rate}</Num>
              <Num>{i.cells.metal}</Num>
              <Num>{i.cells.making}</Num>
              <Num>{i.cells.stone}</Num>
              <Num bold>{i.cells.taxable}</Num>
            </Box>
            {extras.length > 0 && (
              <Box component="tr" sx={shade}>
                <td />
                <Box component="td" colSpan={COLUMNS.length - 1} sx={{ pt: '0 !important', color: MUTED, fontSize: '0.88em' }}>
                  {extras.join('   |   ')}
                </Box>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

const Num = ({ children, bold }) => (
  <Box component="td" sx={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: bold ? 700 : 400 }}>
    {children}
  </Box>
);

function Row({ label, value, strong, tone, size = '1em' }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '8pt', py: '1.5pt', fontWeight: strong ? 700 : 400, fontSize: size, color: tone ?? 'inherit' }}>
      <span>{label}</span>
      <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {value}
      </Box>
    </Box>
  );
}

function Totals({ d, grand }) {
  return (
    <Box>
      {d.summary.map((l) => (
        <Row key={l.label} {...l} />
      ))}
      {grand}
      {d.settlement.map((l) => (
        <Row key={l.label} {...l} tone="#2E6B4F" />
      ))}
      {d.due ? <Row label={t('Balance due')} value={d.due} strong tone="#9B2C2C" /> : <Row label={t('Balance due')} value={t('Fully paid')} tone="#2E6B4F" strong />}
    </Box>
  );
}

function PaymentNotes({ d, opts }) {
  return (
    <Box sx={{ lineHeight: 1.5 }}>
      <Caption>{t('Amount in words')}</Caption>
      <Box sx={{ fontStyle: 'italic', mb: '6pt' }}>{d.words}</Box>
      {d.payments.length > 0 && (
        <>
          <Caption>{t('Payment received')}</Caption>
          <Box sx={{ mb: '6pt' }}>{d.payments.map((p) => `${p.label} ${p.value}${p.reference ? ` (${p.reference})` : ''}`).join('  ·  ')}</Box>
        </>
      )}
      {opts.showRateTable && d.rates.length > 0 && (
        <>
          <Caption>{t('Today\'s rates')}</Caption>
          <Box sx={{ mb: '6pt' }}>{d.rates.map((r) => `${r.label} ${r.value}`).join('  ·  ')}</Box>
        </>
      )}
      {d.notes && <Box sx={{ color: MUTED }}>{t('Note: {{notes}}', { notes: d.notes })}</Box>}
    </Box>
  );
}

const Caption = ({ children }) => <Box sx={{ fontSize: '0.8em', letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, fontWeight: 700 }}>{children}</Box>;

function Signoff({ d, opts }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16pt', mt: '14pt', breakInside: 'avoid' }}>
      <Box sx={{ color: MUTED, maxWidth: '60%', lineHeight: 1.45, fontSize: '0.9em' }}>
        {opts.terms && (
          <>
            <Caption>{t('Terms & conditions')}</Caption>
            <Box sx={{ whiteSpace: 'pre-line' }}>{opts.terms}</Box>
          </>
        )}
      </Box>
      <Box sx={{ textAlign: 'center', minWidth: '45mm' }}>
        <Box sx={{ fontWeight: 700, mb: '22pt' }}>{t('For {{name}}', { name: d.seller.name })}</Box>
        <Box sx={{ borderTop: `1px solid ${MUTED}`, pt: '3pt', color: MUTED }}>{opts.signatoryLabel}</Box>
      </Box>
    </Box>
  );
}

const Cancelled = ({ d }) =>
  d.cancelled ? <Box sx={{ color: '#9B2C2C', fontWeight: 800, letterSpacing: '0.2em', border: '2px solid #9B2C2C', display: 'inline-block', px: '6pt', py: '1pt', mt: '4pt' }}>{t('CANCELLED')}</Box> : null;

/* ------------------------------------------------------------------ A4 designs */

function A4Classic({ d, opts, logo, copy }) {
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '16pt', alignItems: 'flex-start' }}>
        <Box sx={{ display: 'flex', gap: '10pt', alignItems: 'flex-start' }}>
          <Logo src={logo} size={52} />
          <Box>
            <Box sx={{ fontFamily: fonts.display, fontSize: '2.6em', fontWeight: 700, lineHeight: 1.05 }}>{d.seller.name}</Box>
            <SellerLines d={d} />
          </Box>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Box sx={{ color: GOLD, fontWeight: 800, letterSpacing: '0.22em', fontSize: '1.05em' }}>{t('TAX INVOICE')}</Box>
          {copy && <Box sx={{ color: MUTED, fontSize: '0.85em', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{copy}</Box>}
          <Box sx={{ mt: '6pt' }}>
            <InvoiceMeta d={d} />
          </Box>
          <Cancelled d={d} />
        </Box>
      </Box>
      <Box sx={{ height: '2.5pt', background: 'linear-gradient(90deg, var(--brand-deep), var(--brand-light), var(--brand-deep))', my: '10pt' }} />
      <BillTo d={d} />
      <Box sx={{ mt: '10pt' }}>
        <ItemsTable d={d} opts={opts} head={{ bgcolor: GOLD_FILL, color: GOLD, borderTop: `1px solid ${GOLD}`, borderBottom: `1px solid ${GOLD}` }} />
      </Box>
      <Box sx={{ display: 'flex', gap: '20pt', mt: '10pt', breakInside: 'avoid' }}>
        <Box sx={{ flex: 1 }}>
          <PaymentNotes d={d} opts={opts} />
        </Box>
        <Box sx={{ width: '72mm' }}>
          <Totals d={d} grand={<Box sx={{ borderTop: `1px solid ${GOLD}`, borderBottom: `1px solid ${GOLD}`, my: '4pt', py: '2pt' }}><Row label={t('Invoice total')} value={d.grandTotal} strong size="1.25em" /></Box>} />
        </Box>
      </Box>
      <Signoff d={d} opts={opts} />
      {opts.footerNote && <Box sx={{ textAlign: 'center', color: GOLD, mt: '12pt', fontStyle: 'italic', fontFamily: fonts.display, fontSize: '1.2em' }}>{opts.footerNote}</Box>}
    </>
  );
}

function A4Royal({ d, opts, logo, copy }) {
  const ornament = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8pt', color: GOLD, my: '6pt' }}>
      <Box sx={{ flex: 1, borderTop: `1px solid ${GOLD}` }} />
      <span>◆</span>
      <Box sx={{ flex: 1, borderTop: `1px solid ${GOLD}` }} />
    </Box>
  );
  return (
    <Box sx={{ border: `3px double ${GOLD}`, p: '10pt', minHeight: '100%' }}>
      <Box sx={{ border: `1px solid ${GOLD}`, p: '12pt' }}>
        <Box sx={{ textAlign: 'center' }}>
          {logo && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: '4pt' }}>
              <Logo src={logo} size={56} />
            </Box>
          )}
          <Box sx={{ fontFamily: fonts.display, fontSize: '2.9em', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.05, color: INK }}>{d.seller.name}</Box>
          <SellerLines d={d} align="center" />
          {ornament}
          <Box sx={{ display: 'inline-block', bgcolor: GOLD, color: '#fff', fontFamily: fonts.display, fontWeight: 700, letterSpacing: '0.3em', px: '14pt', py: '2pt', fontSize: '1.15em' }}>{t('TAX INVOICE')}</Box>
          {copy && <Box sx={{ color: MUTED, fontSize: '0.85em', textTransform: 'uppercase', letterSpacing: '0.12em', mt: '2pt' }}>{copy}</Box>}
          <Box>
            <Cancelled d={d} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '16pt', mt: '12pt' }}>
          <BillTo d={d} label={t('Billed to')} />
          <InvoiceMeta d={d} />
        </Box>
        <Box sx={{ mt: '10pt' }}>
          <ItemsTable d={d} opts={opts} serif head={{ borderTop: `1.5px solid ${GOLD}`, borderBottom: `1.5px solid ${GOLD}`, color: GOLD }} />
        </Box>
        <Box sx={{ display: 'flex', gap: '20pt', mt: '10pt', breakInside: 'avoid' }}>
          <Box sx={{ flex: 1 }}>
            <PaymentNotes d={d} opts={opts} />
          </Box>
          <Box sx={{ width: '74mm' }}>
            <Totals
              d={d}
              grand={
                <Box sx={{ border: `1.5px solid ${GOLD}`, bgcolor: GOLD_FILL, px: '6pt', py: '3pt', my: '5pt' }}>
                  <Row label={<Box component="span" sx={{ fontFamily: fonts.display, letterSpacing: '0.06em' }}>{t('Grand total')}</Box>} value={d.grandTotal} strong size="1.3em" />
                </Box>
              }
            />
          </Box>
        </Box>
        {ornament}
        <Signoff d={d} opts={opts} />
        {opts.footerNote && <Box sx={{ textAlign: 'center', color: GOLD, mt: '10pt', fontFamily: fonts.display, fontStyle: 'italic', fontSize: '1.3em' }}>{opts.footerNote}</Box>}
      </Box>
    </Box>
  );
}

function A4Modern({ d, opts, logo, copy }) {
  return (
    <>
      <Box sx={{ bgcolor: INK, color: '#fff', px: '14pt', py: '12pt', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16pt', borderBottom: '4pt solid var(--brand)' }}>
        <Box sx={{ display: 'flex', gap: '10pt', alignItems: 'center' }}>
          {logo && (
            <Box sx={{ bgcolor: '#fff', p: '3pt', borderRadius: '3pt' }}>
              <Logo src={logo} size={40} />
            </Box>
          )}
          <Box>
            <Box sx={{ fontSize: '2em', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{d.seller.name}</Box>
            {d.seller.gstin && <Box sx={{ color: 'var(--brand-light)', fontWeight: 600 }}>{t('GSTIN {{gstin}}', { gstin: d.seller.gstin })}</Box>}
          </Box>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Box sx={{ fontSize: '0.85em', letterSpacing: '0.24em', color: 'var(--brand-light)', fontWeight: 700 }}>{t('TAX INVOICE')}{copy ? ` · ${copy.toUpperCase()}` : ''}</Box>
          <Box sx={{ fontSize: '1.4em', fontWeight: 800 }}>{d.invoiceNo}</Box>
          <Box sx={{ color: '#CFCAC0' }}>{d.date}</Box>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10pt', mt: '10pt' }}>
        <Box sx={{ bgcolor: '#F6F4EF', p: '8pt', borderRadius: '3pt' }}>
          <Caption>{t('From')}</Caption>
          <Box sx={{ fontWeight: 700 }}>{d.seller.name}</Box>
          <SellerLines d={{ ...d, seller: { ...d.seller, gstin: null } }} />
        </Box>
        <Box sx={{ bgcolor: '#F6F4EF', p: '8pt', borderRadius: '3pt' }}>
          <BillTo d={d} />
          {(d.orderNo || d.placeOfSupply) && <Box sx={{ color: MUTED, mt: '2pt' }}>{[d.orderNo && t('Order {{orderNo}}', { orderNo: d.orderNo }), d.placeOfSupply && t('Supply: {{placeOfSupply}}', { placeOfSupply: d.placeOfSupply })].filter(Boolean).join('  ·  ')}</Box>}
        </Box>
      </Box>
      <Cancelled d={d} />
      <Box sx={{ mt: '10pt' }}>
        <ItemsTable d={d} opts={opts} zebra head={{ borderBottom: `2px solid ${INK}`, color: INK }} />
      </Box>
      <Box sx={{ display: 'flex', gap: '20pt', mt: '10pt', breakInside: 'avoid' }}>
        <Box sx={{ flex: 1 }}>
          <PaymentNotes d={d} opts={opts} />
        </Box>
        <Box sx={{ width: '74mm' }}>
          <Totals
            d={d}
            grand={
              <Box sx={{ bgcolor: 'var(--brand)', color: 'var(--brand-contrast)', px: '6pt', py: '4pt', my: '5pt', borderRadius: '3pt' }}>
                <Row label={t('Total')} value={d.grandTotal} strong size="1.35em" />
              </Box>
            }
          />
        </Box>
      </Box>
      <Signoff d={d} opts={opts} />
      {opts.footerNote && <Box sx={{ textAlign: 'center', color: MUTED, mt: '12pt', fontWeight: 600 }}>{opts.footerNote}</Box>}
    </>
  );
}

/* ------------------------------------------------------------------ thermal receipts (black only) */

const Dash = () => <Box sx={{ borderTop: '1px dashed #000', my: '3pt' }} />;

function TLine({ label, value, strong, size }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '4pt', fontWeight: strong ? 800 : 400, fontSize: size }}>
      <Box component="span" sx={{ minWidth: 0 }}>{label}</Box>
      <Box component="span" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Box>
    </Box>
  );
}

function Thermal({ d, opts, logo, copy, variant }) {
  const compact = variant === 'compact';
  const detailed = variant === 'detailed';
  const s = d.seller;
  return (
    <Box sx={{ color: '#000', lineHeight: 1.35 }}>
      <Box sx={{ textAlign: 'center' }}>
        {logo && !compact && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: '3pt' }}>
            <Box component="img" src={logo} alt="" sx={{ height: 34, maxWidth: '70%', objectFit: 'contain', filter: 'grayscale(1)' }} />
          </Box>
        )}
        <Box sx={{ fontWeight: 800, fontSize: '1.45em', lineHeight: 1.15 }}>{s.name}</Box>
        {!compact && s.branchName && <div>{s.branchName}</div>}
        {!compact && s.fullAddress && <div>{s.fullAddress}</div>}
        {s.phone && <div>{t('Ph: {{phone}}', { phone: s.phone })}</div>}
        {s.gstin && <Box sx={{ fontWeight: 700 }}>{t('GSTIN: {{gstin}}', { gstin: s.gstin })}</Box>}
      </Box>
      <Dash />
      <Box sx={{ textAlign: 'center', fontWeight: 800, letterSpacing: '0.12em' }}>{t('TAX INVOICE')}{copy && !compact ? ` (${copy})` : ''}</Box>
      {d.cancelled && <Box sx={{ textAlign: 'center', fontWeight: 800 }}>{t('*** CANCELLED ***')}</Box>}
      <TLine label={t('No: {{invoiceNo}}', { invoiceNo: d.invoiceNo })} value="" />
      <div>{d.date}</div>
      {d.orderNo && <div>{t('Order: {{orderNo}}', { orderNo: d.orderNo })}</div>}
      <Dash />
      {d.customer ? (
        <>
          <Box sx={{ fontWeight: 700 }}>{d.customer.name}</Box>
          <div>{d.customer.mobile}</div>
          {!compact && d.customer.gstin && <div>{t('GSTIN: {{gstin}}', { gstin: d.customer.gstin })}</div>}
        </>
      ) : (
        <div>{t('Walk-in customer')}</div>
      )}
      <Dash />
      {d.items.map((i) =>
        compact ? (
          <TLine key={i.n} label={`${i.n}. ${i.name}${i.returned ? t(' (ret)') : ''}`} value={i.taxable} />
        ) : (
          <Box key={i.n} sx={{ mb: '3pt', breakInside: 'avoid' }}>
            <Box sx={{ fontWeight: 700 }}>
              {i.n}. {i.name}
              {i.returned ? t(' (returned)') : ''}
            </Box>
            <div>{[i.purity, opts.showHuid && i.huid && t('HUID {{huid}}', { huid: i.huid }), opts.showHsn && i.hsn && t('HSN {{hsn}}', { hsn: i.hsn })].filter(Boolean).join(' · ')}</div>
            {opts.showWeightBreakup && (
              <div>
                {t('Gr {{gross}}', { gross: i.gross })}
                {i.stoneWt ? t(' · St {{stoneWt}}', { stoneWt: i.stoneWt }) : ''}
              </div>
            )}
            {!detailed && i.stones.length > 0 && <div>{t('Stones: {{stones}}', { stones: i.stones.map((st) => `${st.label} ${st.weight}`).join(', ') })}</div>}
            <TLine label={t('Net {{net}} @ {{rate}}', { net: i.net, rate: i.rate })} value={i.taxable} strong />
            {detailed && (
              <Box sx={{ pl: '6pt' }}>
                <TLine label={t('Metal')} value={i.metal} />
                {i.making !== '—' && <TLine label={t('Making')} value={i.making} />}
                {i.stone !== '—' && <TLine label={t('Stone')} value={i.stone} />}
                {i.stones.map((st, k) => (
                  <div key={k}>
                    · {st.label} {st.weight}
                    {st.rate ? ` @ ${st.rate}` : ''}
                  </div>
                ))}
                {i.other && <TLine label={t('Other')} value={i.other} />}
                {i.discount && <TLine label={t('Discount')} value={`− ${i.discount}`} />}
              </Box>
            )}
          </Box>
        ),
      )}
      <Dash />
      {d.summary.map((l) => (
        <TLine key={l.label} {...l} />
      ))}
      <Box sx={{ borderTop: '1px solid #000', borderBottom: '1px solid #000', my: '3pt', py: '2pt' }}>
        <TLine label={t('TOTAL')} value={d.grandTotal} strong size="1.3em" />
      </Box>
      {d.settlement.map((l) => (
        <TLine key={l.label} {...l} />
      ))}
      <TLine label={t('Balance due')} value={d.due ?? t('Nil')} strong />
      {!compact && d.payments.length > 0 && <div>{t('Paid by: {{payments}}', { payments: d.payments.map((p) => `${p.label} ${p.value}`).join(', ') })}</div>}
      {!compact && <Box sx={{ fontStyle: 'italic', mt: '2pt' }}>{d.words}</Box>}
      {opts.showRateTable && !compact && d.rates.length > 0 && (
        <>
          <Dash />
          <div>{t('Rates: {{rates}}', { rates: d.rates.map((r) => `${r.label} ${r.value}`).join(', ') })}</div>
        </>
      )}
      <Dash />
      {opts.terms && !compact && <Box sx={{ fontSize: '0.9em', whiteSpace: 'pre-line' }}>{opts.terms}</Box>}
      {opts.footerNote && <Box sx={{ textAlign: 'center', fontWeight: 700, mt: '3pt' }}>{opts.footerNote}</Box>}
    </Box>
  );
}

const DESIGNS = {
  a4: { classic: A4Classic, royal: A4Royal, modern: A4Modern },
  thermal80: { standard: (p) => <Thermal {...p} variant="standard" />, detailed: (p) => <Thermal {...p} variant="detailed" /> },
  thermal58: { standard: (p) => <Thermal {...p} variant="standard" />, compact: (p) => <Thermal {...p} variant="compact" /> },
};

/**
 * One printed invoice in the chosen paper size and design, laid out at the paper's real width (mm) so the screen
 * preview and the print match. `copy` (0-based) labels Original / Duplicate when more than one copy prints.
 */
export default function InvoiceDocument({ sale, layout, logo, copy = null }) {
  const size = PRINT_SIZES[layout.size] ? layout.size : 'a4';
  const paper = PRINT_SIZES[size];
  const Design = DESIGNS[size][layout.design] ?? Object.values(DESIGNS[size])[0];
  const d = invoiceData(sale);
  return (
    <Box
      className="invoice-document"
      sx={{
        width: `${paper.widthMm}mm`,
        boxSizing: 'border-box',
        bgcolor: '#fff',
        color: INK,
        fontFamily: fonts.body,
        fontSize: `${paper.base}pt`,
        lineHeight: 1.4,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        '& *': { boxSizing: 'border-box' },
      }}
    >
      <Design d={d} opts={layout} logo={logo} copy={copy == null ? null : COPY_LABELS[copy]} />
    </Box>
  );
}
