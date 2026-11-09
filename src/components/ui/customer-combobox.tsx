import * as React from "react"
import { Check, ChevronsUpDown, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Customer } from "@/types"

interface CustomerComboboxProps {
  customers: Customer[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  isLoading?: boolean
  onAddCustomer?: () => void
}

export function CustomerCombobox({
  customers,
  value,
  onValueChange,
  placeholder = "Select customer...",
  className,
  disabled = false,
  isLoading = false,
  onAddCustomer,
}: CustomerComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedCustomer = customers.find((customer) => customer.id === value)


  const handleSelect = (customerId: string) => {
    onValueChange(customerId === value ? "" : customerId)
    setOpen(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex-1 justify-between"
            disabled={disabled || isLoading}
            data-testid="customer-select"
          >
            {selectedCustomer ? (
              <div className="flex flex-col items-start text-left">
                <span className="font-medium">{selectedCustomer.name}</span>
                <span className="text-xs text-muted-foreground">
                  {selectedCustomer.email}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command onKeyDown={handleKeyDown}>
            <CommandInput
              placeholder="Search customers..."
            />
            <CommandList>
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 py-6">
                  <span className="text-sm text-muted-foreground">
                    No customers found.
                  </span>
                  {onAddCustomer && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onAddCustomer()
                        setOpen(false)
                      }}
                      className="gap-2"
                    >
                      <UserPlus className="h-4 w-4" />
                      Add New Customer
                    </Button>
                  )}
                </div>
              </CommandEmpty>
              <CommandGroup>
                {customers.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    value={`${customer.name} ${customer.email} ${customer.phone || ''}`}
                    onSelect={() => handleSelect(customer.id)}
                    className="flex items-center gap-2 p-3"
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === customer.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <div className="font-medium text-sm">{customer.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {customer.email}
                      </div>
                      {customer.phone && (
                        <div className="text-xs text-muted-foreground">
                          {customer.phone}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      
      {onAddCustomer && (
        <Button
          variant="outline"
          size="icon"
          onClick={onAddCustomer}
          disabled={disabled || isLoading}
          title="Add new customer"
          aria-label="Add new customer"
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}