#!/bin/zsh
# <xbar.title>Marginalia</xbar.title>
# <xbar.desc>Status of the marginalia poller.</xbar.desc>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideDisableFor>true</swiftbar.hideDisableFor>
#
# SwiftBar entry point (the ".10s" suffix = refreshed every 10 seconds).
# Symlink this file into your SwiftBar plugin folder; it resolves the symlink
# to find menubar.mjs next to it. SwiftBar runs plugins with a minimal PATH,
# hence the explicit Homebrew/nvm locations.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:$PATH"
exec node "${0:A:h}/menubar.mjs"
