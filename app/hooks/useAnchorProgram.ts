import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "../utils/idl.json";
import { useSession } from "../components/SessionProvider";
import { useCallback, useMemo } from "react";

const PROGRAM_ID = new PublicKey("5YNSWuk2aqtejuBhz8Tv1xEbxE8rh3BbsPDFzk25LpYw");

export const useAnchorProgram = () => {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { keypair } = useSession();

    const actingWallet = useMemo(() => {
        if (keypair) {
            return {
                publicKey: keypair.publicKey,
                signTransaction: async (tx: any) => {
                    tx.partialSign(keypair);
                    return tx;
                },
                signAllTransactions: async (txs: any[]) => {
                    return txs.map((tx) => {
                        tx.partialSign(keypair);
                        return tx;
                    });
                },
            };
        }
        return wallet;
    }, [wallet, keypair]);

    const getProgram = useCallback(() => {
        if (!actingWallet || !actingWallet.publicKey) return null;

        const provider = new AnchorProvider(
            connection,
            actingWallet as any,
            AnchorProvider.defaultOptions()
        );

        return new Program(idl as Idl, provider);
    }, [connection, actingWallet]);

    return {
        getProgram,
        programId: PROGRAM_ID,
    };
};
