-- Company on trip participants (Chat roster: Name - Company - Role)

alter table trip_participants
  add column if not exists company text;
