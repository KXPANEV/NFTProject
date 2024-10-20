// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";


contract SoulboundNFT is ERC721Enumerable, Ownable {
    uint256 private _tokenIdCounter; // Счетчик токенов
    mapping(uint256 => bool) private _revoked; // Словарь для отслеживания отозванных токенов

    struct NFTMetadata {
        string name;
        string surname;
        string workplace;
        string imageUrl;
    }

    mapping(uint256 => NFTMetadata) private _tokenMetadata; // Маппинг для хранения метаданных токенов

    struct VerifiableCredential {
        string issuer;
        address holder;
        string issuanceDate;
        string signature;
    }

    mapping(uint256 => VerifiableCredential) private _verifiableCredentials; // Маппинг для VC

    constructor() ERC721("SoulboundNFT", "SBNFT") Ownable(msg.sender) {}

    function exists(uint256 tokenId) public view returns (bool) {
        return exists(tokenId);
    }

    event TokenMinted(
        address indexed recipient,
        uint256 indexed tokenId,
        string name,
        string surname,
        string workplace,
        string imageUrl
    );

    event TokenRevoked(uint256 indexed tokenId, address indexed owner);

    event TokenMetadataRequested(uint256 indexed tokenId); // Новое событие для запроса метаданных

    function mint(
        address to,
        string memory name,
        string memory surname,
        string memory workplace,
        string memory imageUrl,
        string memory issuer,
        string memory issuanceDate,
        string memory signature
    ) external onlyOwner {
        require(to != address(0), "Cannot mint to the zero address"); // Проверка на нулевой адрес
        uint256 tokenId = _tokenIdCounter; // Устанавливаем tokenId до инкремента
        _mint(to, tokenId);
        _tokenIdCounter++; // Инкрементируем после mint
        console.log("Minting NFT for:", to);

        // Сохраняем метаданные токена
        _tokenMetadata[tokenId] = NFTMetadata(name, surname, workplace, imageUrl);

        // Создание нового VerifiableCredential
        _verifiableCredentials[tokenId] = VerifiableCredential({
            issuer: issuer,
            holder: to,
            issuanceDate: issuanceDate,
            signature: signature
        });

        // Эмитируем событие с адресом получателя
        emit TokenMinted(
            to, // Используем to вместо recipient
            tokenId,
            name,
            surname,
            workplace,
            imageUrl
        );
    }

    function revoke(uint256 tokenId) external onlyOwner {
        require(exists(tokenId), "ERC721: owner query for nonexistent token");
        require(!_revoked[tokenId], "Token already revoked");

        address owner = ownerOf(tokenId);
        _revoked[tokenId] = true; // Устанавливаем флаг отзыва
        _burn(tokenId); // Отзываем токен

        emit TokenRevoked(tokenId, owner); // Эмитируем событие с адресом владельца
    }



    function getTokenMetadata(uint256 tokenId) external view returns (NFTMetadata memory) {

        require(exists(tokenId), "Query for nonexistent token");
        return _tokenMetadata[tokenId];
    }
}
