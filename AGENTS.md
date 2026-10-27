# Release workflow

Ship approved changes through a GitHub pull request. Merging through GitHub and allowing the existing automatic deployment is permitted.

Never deploy directly on Laravel Cloud: do not click Deploy, invoke a Cloud deployment API/CLI, or run deployment commands in its console. Do not alter Cloud deployment settings unless the user specifically asks. Put necessary release steps in the repository so the existing automation handles them.
