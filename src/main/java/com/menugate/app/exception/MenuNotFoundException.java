package com.menugate.app.exception;

public class MenuNotFoundException extends RuntimeException {

    public MenuNotFoundException(Long menuId) {
        super("Menu not found with ID: " + menuId);
    }

    public MenuNotFoundException(Long menuId, Long itemId) {
        super("Menu item not found with ID: " + itemId + " in menu: " + menuId);
    }
}
