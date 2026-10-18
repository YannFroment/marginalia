Thanks for the change. I read through the diff and it looks reasonable overall, although I
would think twice about the retry loop, which never gives up. Otherwise nothing stands out,
and the naming is consistent with the rest of the module. Tests pass locally.
