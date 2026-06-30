package com.menugate.app.service;

import com.menugate.app.dto.*;
import com.menugate.app.exception.MenuNotFoundException;
import com.menugate.app.model.Menu;
import com.menugate.app.model.MenuItem;
import com.menugate.app.model.User;
import com.menugate.app.repository.MenuItemRepository;
import com.menugate.app.repository.MenuRepository;
import com.menugate.app.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MenuService {

    private final MenuRepository menuRepository;
    private final MenuItemRepository menuItemRepository;
    private final UserRepository userRepository;

    public List<MenuResponse> getAllMenus() {
        return menuRepository.findAllByOrderByMenuIdAsc().stream()
                .map(this::toMenuResponse)
                .collect(Collectors.toList());
    }

    public MenuResponse getMenu(Long menuId) {
        Menu menu = menuRepository.findById(menuId)
                .orElseThrow(() -> new MenuNotFoundException(menuId));
        return toMenuResponse(menu);
    }

    @Transactional
    public MenuResponse createMenu(String ownerEmail, MenuRequest request) {
        User owner = userRepository.findById(ownerEmail)
                .orElseThrow(() -> new RuntimeException("User not found: " + ownerEmail));

        Menu menu = Menu.builder()
                .title(request.getTitle())
                .category(request.getCategory())
                .owner(owner)
                .build();

        Menu saved = menuRepository.save(menu);
        return toMenuResponse(saved);
    }

    @Transactional
    public MenuResponse updateMenu(String ownerEmail, Long menuId, MenuRequest request) {
        Menu menu = menuRepository.findByMenuIdAndOwnerEmail(menuId, ownerEmail)
                .orElseThrow(() -> new MenuNotFoundException(menuId));

        menu.setTitle(request.getTitle());
        menu.setCategory(request.getCategory());

        Menu saved = menuRepository.save(menu);
        return toMenuResponse(saved);
    }

    @Transactional
    public void deleteMenu(String ownerEmail, Long menuId) {
        Menu menu = menuRepository.findByMenuIdAndOwnerEmail(menuId, ownerEmail)
                .orElseThrow(() -> new MenuNotFoundException(menuId));
        menuRepository.delete(menu);
    }

    @Transactional
    public MenuItemResponse addMenuItem(String ownerEmail, Long menuId, MenuItemRequest request) {
        Menu menu = menuRepository.findByMenuIdAndOwnerEmail(menuId, ownerEmail)
                .orElseThrow(() -> new MenuNotFoundException(menuId));

        MenuItem item = MenuItem.builder()
                .name(request.getName())
                .description(request.getDescription())
                .price(request.getPrice())
                .available(true)
                .menu(menu)
                .build();

        MenuItem saved = menuItemRepository.save(item);
        return toMenuItemResponse(saved);
    }

    @Transactional
    public MenuItemResponse updateMenuItem(String ownerEmail, Long menuId, Long itemId, MenuItemRequest request) {
        Menu menu = menuRepository.findByMenuIdAndOwnerEmail(menuId, ownerEmail)
                .orElseThrow(() -> new MenuNotFoundException(menuId));

        MenuItem item = menuItemRepository.findById(itemId)
                .filter(i -> i.getMenu().getMenuId().equals(menuId))
                .orElseThrow(() -> new MenuNotFoundException(menuId, itemId));

        item.setName(request.getName());
        item.setDescription(request.getDescription());
        item.setPrice(request.getPrice());

        MenuItem saved = menuItemRepository.save(item);
        return toMenuItemResponse(saved);
    }

    @Transactional
    public void deleteMenuItem(String ownerEmail, Long menuId, Long itemId) {
        Menu menu = menuRepository.findByMenuIdAndOwnerEmail(menuId, ownerEmail)
                .orElseThrow(() -> new MenuNotFoundException(menuId));

        MenuItem item = menuItemRepository.findById(itemId)
                .filter(i -> i.getMenu().getMenuId().equals(menuId))
                .orElseThrow(() -> new MenuNotFoundException(menuId, itemId));

        menuItemRepository.delete(item);
    }

    public List<MenuResponse> adminGetAllMenus() {
        return menuRepository.findAllByOrderByMenuIdAsc().stream()
                .map(this::toMenuResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void adminDeleteMenu(Long menuId) {
        Menu menu = menuRepository.findById(menuId)
                .orElseThrow(() -> new MenuNotFoundException(menuId));
        menuRepository.delete(menu);
    }

    private MenuResponse toMenuResponse(Menu menu) {
        List<MenuItemResponse> itemResponses = menu.getItems().stream()
                .map(this::toMenuItemResponse)
                .collect(Collectors.toList());

        return MenuResponse.builder()
                .menuId(menu.getMenuId())
                .title(menu.getTitle())
                .category(menu.getCategory())
                .ownerEmail(menu.getOwner().getEmail())
                .items(itemResponses)
                .build();
    }

    private MenuItemResponse toMenuItemResponse(MenuItem item) {
        return MenuItemResponse.builder()
                .menuItemId(item.getMenuItemId())
                .name(item.getName())
                .description(item.getDescription())
                .price(item.getPrice())
                .available(item.getAvailable())
                .build();
    }
}
