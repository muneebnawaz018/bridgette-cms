'use client';

import { useMemo } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import { useApi } from '@/lib/api/useApi';
import { formatMoney } from '@/lib/format/money';
import { colors, gradients, whiteA } from '@/lib/colors';

/*
 * The products a customer buys — a plain multi-select, saved as ids on the customer record.
 *
 * Only the ids are stored. Rate, discount and unit stay on the Product and are read from there
 * whenever an invoice is raised, so a price change in the catalogue reaches every customer
 * without touching a single customer record.
 */

/** Hoisted so emotion does not re-serialize it for every chip on every render. */
const CHIP_SX = {
  height: 28,
  backgroundImage: gradients.brand,
  color: colors.brand.white,
  fontWeight: 600,
  '& .MuiChip-deleteIcon': {
    color: whiteA(0.7),
    '&:hover': { color: colors.brand.white },
  },
} as const;

interface ProductOption {
  _id: string;
  name: string;
  sku: string;
  unit: string;
  defaultRate: number;
  discount?: number;
}

export function CustomerProductsField({
  value,
  onChange,
  discounts,
  onDiscountChange,
  disabled,
}: {
  /** Product ids. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Per-product discount overrides, keyed by product id. Absent = use the product default. */
  discounts: Record<string, string>;
  onDiscountChange: (productId: string, percent: string) => void;
  disabled?: boolean;
}) {
  // globalLoading off: this is one field inside an open dialog, not a page transition.
  const { data, isLoading } = useApi<{ items: ProductOption[] }>('/api/products/options', {
    globalLoading: false,
  });
  const options = useMemo(() => data?.items ?? [], [data]);

  // Ids the form holds that are no longer in the catalogue (deleted since) simply drop out of
  // the selection rather than rendering as a blank chip.
  const selected = useMemo(() => options.filter((o) => value.includes(o._id)), [options, value]);

  const picker = (
    <Autocomplete
      multiple
      disableCloseOnSelect
      options={options}
      value={selected}
      loading={isLoading}
      disabled={disabled}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(o, v) => o._id === v._id}
      onChange={(_e, picked) => onChange(picked.map((p) => p._id))}
      noOptionsText={
        options.length === 0 ? 'No products yet — add one under Products & Fabrics' : 'No match'
      }
      renderOption={(props, o) => (
        <Box component="li" {...props} key={o._id}>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ fontWeight: 600 }}>{o.name}</Box>
            <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {o.sku ? `${o.sku} · ` : ''}
              {formatMoney('USD', o.defaultRate)}
              {o.unit ? ` / ${o.unit}` : ''}
              {o.discount ? ` · ${o.discount}% off` : ''}
            </Box>
          </Box>
        </Box>
      )}
      // 28px, not the theme's 22px small chip, which reads as a squashed label inside a
      // full-height input rather than a token you can grab. Brand gradient so a linked product
      // carries the same weight as the primary action, with the delete cross tinted to match.
      renderTags={(tags, getTagProps) =>
        tags.map((o, i) => {
          const { key, ...rest } = getTagProps({ index: i });
          return <Chip key={key} {...rest} label={o.name} sx={CHIP_SX} />;
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label="Products"
          placeholder={selected.length === 0 ? 'Search products' : ''}
          helperText="What this customer buys. These lead the picker when an invoice is raised for them; anything else is still billable."
        />
      )}
    />
  );

  return (
    <Box>
      {picker}

      {/*
       * Discounts are per product, so they can only be set once a product has been picked —
       * hence a list under the selector rather than a field beside it. Left blank, the product's
       * own standing discount applies; a number here replaces it for this customer only.
       */}
      {selected.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', fontWeight: 700, mb: 1 }}
          >
            DISCOUNTS FOR THIS CUSTOMER
          </Typography>
          {selected.map((o) => (
            <Box
              key={o._id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 0.75,
                flexWrap: { xs: 'wrap', sm: 'nowrap' },
              }}
            >
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{o.name}</Box>
                <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  {o.discount ? `Product default ${o.discount}% off` : 'No product discount'}
                </Box>
              </Box>
              {/* No label: the column heading above already says what these are, and a floating
                  "Discount" inside a 3-character box left no room for the number. The placeholder
                  carries the product's own figure, so an empty box visibly means "use that". */}
              <TextField
                size="small"
                type="number"
                aria-label={`Discount for ${o.name}`}
                value={discounts[o._id] ?? ''}
                placeholder={String(o.discount ?? 0)}
                disabled={disabled}
                onChange={(e) => onDiscountChange(o._id, e.target.value)}
                sx={{ width: 92, flexShrink: 0 }}
                slotProps={{
                  htmlInput: { inputMode: 'decimal', min: 0, max: 100 },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end" sx={{ ml: 0.25 }}>
                        %
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
