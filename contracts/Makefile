# Usage: make dry-run   (simulation only, reads .env)
#        make deploy    (BROADCASTS: only after explicit confirmation)
-include .env
export

dry-run:
	forge script script/Deploy.s.sol:Deploy --rpc-url $(CELO_RPC_URL) -vvv

deploy:
	@echo "This sends a transaction and spends CELO. Pass ACCOUNT=<keystore name>."
	forge script script/Deploy.s.sol:Deploy --rpc-url $(CELO_RPC_URL) --account $(ACCOUNT) --broadcast --verify -vvv
