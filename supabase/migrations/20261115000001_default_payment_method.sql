-- Default payment method: pre-selected on new transactions.
-- Composite FK keeps it scoped to the owner's own payment methods; deleting the method clears it.
alter table public.profiles
  add column default_payment_method_id uuid;

alter table public.profiles
  add constraint profiles_default_payment_method_fk
  foreign key (default_payment_method_id, id) references public.payment_methods (id, user_id)
  on delete set null (default_payment_method_id);
