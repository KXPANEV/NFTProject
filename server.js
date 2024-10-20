const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { ethers } = require('ethers');

const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const contractAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"; // Адрес вашего контракта

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractABI = require("./artifacts/contracts/SoulboundNFT.sol/SoulboundNFT.json").abi;

const contract = new ethers.Contract(contractAddress, contractABI, wallet);
const { isAddress } = ethers;

// Подписка на события TokenMinted
contract.on("TokenMinted", (creator, tokenId) => {
    console.log(`TokenMinted event: creator = ${creator}, tokenId = ${tokenId}`);
});

// Функция для подписания VC
async function signVC(vcData) {
    const message = JSON.stringify(vcData);
    const signature = await wallet.signMessage(message);
    return signature;
}

// Эндпоинт для подписи VC
app.post("/sign-vc", async (req, res) => {
    try {
        const vcData = req.body;
        const signature = await signVC(vcData);
        res.send({ signature });
    } catch (error) {
        console.error("Ошибка при подписании VC:", error);
        res.status(500).send({ error: "Ошибка при подписании VC" });
    }
});

// Эндпоинт для создания токенов
app.post("/mint", async (req, res) => {
    try {
        // Лог для отладки полученных данных
        console.log("Received data:", req.body);

        const { address, name, surname, workplace, imageUrl, issuer, issuanceDate, signature } = req.body;

        // Проверка адреса
        if (!isAddress(address)) {
            console.log("Invalid address:", address);
            return res.status(400).send({ error: "Invalid address" });
        }

        // Проверка даты
        const issuanceDateFormatted = new Date(issuanceDate);
        if (isNaN(issuanceDateFormatted.getTime())) {
            console.log("Invalid issuance date:", issuanceDate);
            return res.status(400).send({ error: "Invalid issuance date" });
        }

        // Выпуск токена
        const tx = await contract.mint(
            address,
            name,
            surname,
            workplace,
            imageUrl,
            issuer,
            issuanceDate,
            signature
        );

        // Ожидание подтверждения транзакции
        const receipt = await tx.wait();
        console.log("Receipt:", receipt);

        // Декодирование логов событий
        const eventInterface = new ethers.Interface([
            "event TokenMinted(address indexed to, uint256 indexed tokenId, string name, string surname, string workplace, string imageUrl)"
        ]);

        // Обработка логов
        const logs = receipt.logs.map(log => {
            try {
                return eventInterface.parseLog(log);
            } catch (e) {
                console.log("Log parsing error:", e);
                return null;
            }
        }).filter(log => log !== null);

        // Поиск события TokenMinted
        const event = logs.find(log => log.name === 'TokenMinted');

        if (event) {
            const to = event.args.to; // Адрес получателя
            const tokenId = event.args.tokenId.toString();
            console.log(`TokenMinted event found: recipient = ${to}, tokenId = ${tokenId}`);
            return res.status(200).send({ message: "NFT успешно выпущен!", tokenId: tokenId });
        }

        console.log("No TokenMinted events found.");
        return res.status(400).send({ error: "No events emitted" });
    } catch (error) {
        console.log("Error during minting:", error);
        return res.status(500).send({ error: error.message });
    }
});


// Эндпоинт для отзыва токенов
app.post("/revoke", async (req, res) => {
    console.log("Revocation request received:", req.body);
    try {
        const { tokenId } = req.body; // Извлекаем tokenId из тела запроса
        const numberTokenId = Number(tokenId);

        if (!Number.isInteger(numberTokenId) || numberTokenId <= 0) { // Проверяем, является ли tokenId валидным
            return res.status(400).send({ error: "Invalid token ID" });
        }

        // Получаем адрес владельца токена
        const owner = await contract.ownerOf(numberTokenId);
        console.log(`Revoking token ${numberTokenId} from owner: ${owner}`);

        // Отзываем токен
        const tx = await contract.revoke(numberTokenId);
        await tx.wait();

        res.send({ status: "Revoked", tokenId: numberTokenId, owner });
    } catch (error) {
        console.error("Revoke Error:", error);
        res.status(500).send({ error: error.message });
    }
});


// Эндпоинт для получения владельца контракта
app.get("/owner", async (req, res) => {
    try {
        const ownerAddress = await contract.owner(); // Исправлено на правильный вызов
        res.send({ owner: ownerAddress });
    } catch (error) {
        console.error("Owner Fetch Error:", error);
        res.status(500).send({ error: error.message });
    }
});

// Эндпоинт для передачи прав собственности
app.post('/transfer-ownership', async (req, res) => {
    const { newOwner } = req.body;

    try {
        const tx = await contract.transferOwnership(newOwner);
        await tx.wait();
        res.status(200).json({ message: 'Ownership transferred successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Эндпоинт для получения метаданных токена
app.get("/metadata/:tokenId", async (req, res) => {
    try {
        const tokenId = req.params.tokenId;
        console.log("Получен запрос на метаданные токена:", tokenId); // Лог для отладки

        if (!Number.isInteger(+tokenId) || tokenId <= 0) {
            return res.status(400).send({ error: "Invalid token ID" });
        }

        // Получаем метаданные токена из контракта
        const metadata = await contract.getTokenMetadata(tokenId);
        console.log("Метаданные токена:", metadata); // Лог для отладки

        if (!metadata) {
            return res.status(404).send({ error: "Token metadata not found" });
        }

        res.json({ metadata });
    } catch (error) {
        console.error("Metadata Fetch Error:", error);
        // Если ошибка связана с запросом к смарт-контракту, уточните сообщение
        if (error.message.includes("Query for nonexistent token")) {
            return res.status(404).send({ error: "Token does not exist" });
        }
        res.status(500).send({ error: error.message });
    }
});

// Функция для проверки подписи
async function verifySignature(vcData, signature, expectedAddress) {
    const message = JSON.stringify(vcData);
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
}

// Эндпоинт для проверки подписи
app.post("/verify", async (req, res) => {
    
    try {
        const { tokenId } = req.body;

        // Получаем метаданные токена из контракта
        const metadata = await contract.getTokenMetadata(tokenId);
        console.log(213)
        // Собираем данные VC для проверки
        const vcData = {
            issuer: metadata.issuer,
            to: metadata.holder, // Исправлено на holder для получения адреса владельца
            issuanceDate: metadata.issuanceDate,
        };
        const signature = metadata.signature;
        const issuerAddress = metadata.issuer;

        // Проверяем подпись
        const isValid = await verifySignature(vcData, signature, issuerAddress);
        console.log(225)
        res.send({ isValid });
    } catch (error) {
        console.error("Verification Error:", error);
        res.status(500).send({ error: error.message });
    }
});

// Запуск сервера на порту 3000
app.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
});
