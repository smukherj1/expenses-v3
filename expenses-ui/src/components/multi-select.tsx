import * as React from 'react'
import Select, {
  components,
  MenuProps,
  MultiValue,
  OptionProps,
  StylesConfig,
} from 'react-select'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

interface Props {
  values: (string | null)[]
  onSelectionChanged?: (values: (string | null)[]) => void
  placeholder?: string
  id?: string
}

function removeNull(s: string | null): string {
  return s === null ? '<unspecified>' : s
}

type OptionType = { value: string | null; label: string }

const selectStyles: StylesConfig<OptionType, true> = {
  control: (base, { isFocused }) => ({
    ...base,
    display: 'flex',
    alignItems: 'center', // vertically center text
    fontSize: '0.875rem', // tailwind text-sm
    lineHeight: '1.25rem', // matches ShadCN
    color: 'oklch(0.984 0.003 247.858)',
    minHeight: '36px',
    height: '36px',
    backgroundColor: 'oklab(1 0 0 / 0.045)',
    borderColor: 'oklch(1 0 0 / 15%)',
    borderRadius: '0.625rem',
    '&:hover': {
      borderColor: 'oklch(1 0 0 / 15%)',
    },
    boxShadow: isFocused ? '0 0 0 1px oklch(0.551 0.027 264.364)' : 'none',
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: 'oklch(0.208 0.042 265.755)',
    color: 'oklch(0.984 0.003 247.858)',
    borderRadius: '0.625rem',
    marginTop: '4px',
    padding: '4px',
  }),
  option: (base, _) => ({
    ...base,
    backgroundColor: 'transparent',
    color: 'oklch(0.984 0.003 247.858)',
    borderRadius: 'calc(0.625rem - 4px)',
    cursor: 'pointer',
    '&:active': {
      backgroundColor: 'transparent',
      color: 'oklch(0.984 0.003 247.858)',
    },
  }),
  input: (base) => ({
    ...base,
    color: 'oklch(0.984 0.003 247.858)',
  }),
  placeholder: (base) => ({
    ...base,
    color: 'oklch(0.984 0.003 247.858)',
  }),
  valueContainer: (base) => ({
    ...base,
    padding: '6px 12px',
  }),
}

export default function MultiSelect({ values, onSelectionChanged, id }: Props) {
  const options = React.useMemo(
    () => values.map((v) => ({ value: v, label: removeNull(v) })),
    [values],
  )

  const [selectedOptions, setSelectedOptions] =
    React.useState<MultiValue<OptionType>>(options)

  React.useEffect(() => {
    setSelectedOptions(options)
  }, [options])

  React.useEffect(() => {
    if (onSelectionChanged) {
      onSelectionChanged(selectedOptions.map((o) => o.value))
    }
  }, [selectedOptions])

  const handleSelectAll = (e: React.MouseEvent) => {
    e.preventDefault()
    setSelectedOptions(options)
  }

  const handleSelectNone = (e: React.MouseEvent) => {
    e.preventDefault()
    setSelectedOptions([])
  }

  const CustomOption = (props: OptionProps<OptionType, true>) => {
    return (
      <components.Option {...props}>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={props.isSelected}
            // The checkbox is controlled by the selection state
          />
          <span>{props.label}</span>
        </div>
      </components.Option>
    )
  }

  const CustomMenu = (props: MenuProps<OptionType, true>) => {
    return (
      <components.Menu {...props}>
        <div>
          <div className="p-2 flex justify-between">
            <Button variant="ghost" size="sm" onClick={handleSelectAll}>
              Select All
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSelectNone}>
              Select None
            </Button>
          </div>
          {props.children}
        </div>
      </components.Menu>
    )
  }

  const getDisplayValue = () => {
    if (selectedOptions.length === options.length) {
      return 'All selected'
    }
    if (selectedOptions.length === 0) {
      return 'None selected'
    }
    return `${selectedOptions.length} of ${options.length} selected`
  }

  return (
    <div className="w-[280px]">
      <Select
        options={options}
        isMulti
        closeMenuOnSelect={false}
        hideSelectedOptions={false}
        value={selectedOptions}
        onChange={setSelectedOptions}
        components={{
          Option: CustomOption,
          Menu: CustomMenu,
          IndicatorSeparator: () => null,
        }}
        controlShouldRenderValue={false}
        placeholder={getDisplayValue()}
        instanceId={id}
        styles={selectStyles}
      />
    </div>
  )
}
