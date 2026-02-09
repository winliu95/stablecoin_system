import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, Idl, setProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "../utils/idl.json";

const PROGRAM_ID = new PublicKey("5YNSWuk2aqtejuBhz8Tv1xEbxE8rh3BbsPDFzk25LpYw");

export const useAnchorProgram = () => {
    const { connection } = useConnection();
    const wallet = useWallet();

    const getProgram = () => {
        if (!wallet.publicKey) return null;

        const provider = new AnchorProvider(
            connection,
            wallet as any,
            AnchorProvider.defaultOptions()
        );
        setProvider(provider);

        const program = new Program(idl as Idl, provider);
        return program;
    };

    return {
        getProgram,
        programId: PROGRAM_ID,
    };
};
