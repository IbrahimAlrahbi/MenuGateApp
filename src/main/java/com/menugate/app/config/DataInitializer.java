package com.menugate.app.config;

import com.menugate.app.model.Menu;
import com.menugate.app.model.MenuItem;
import com.menugate.app.model.User;
import com.menugate.app.repository.MenuItemRepository;
import com.menugate.app.repository.MenuRepository;
import com.menugate.app.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final MenuRepository menuRepository;
    private final MenuItemRepository menuItemRepository;

    @Override
    public void run(String... args) {
        if (userRepository.count() > 0) {
            return;
        }

        User user1 = userRepository.save(User.builder()
                .email("ahmed.albalushi@gmail.com")
                .name("Ahmed Al Balushi")
                .createdAt(LocalDateTime.now())
                .isAdmin(false)
                .build());

        User user2 = userRepository.save(User.builder()
                .email("fatma.alwahaibi@gmail.com")
                .name("Fatma Al Wahaibi")
                .createdAt(LocalDateTime.now())
                .isAdmin(false)
                .build());

        User user3 = userRepository.save(User.builder()
                .email("salim.alharthi@gmail.com")
                .name("Salim Al Harthi")
                .createdAt(LocalDateTime.now())
                .isAdmin(false)
                .build());

        User user4 = userRepository.save(User.builder()
                .email("aisha.alamri@gmail.com")
                .name("Aisha Al Amri")
                .createdAt(LocalDateTime.now())
                .isAdmin(false)
                .build());

        Menu menu1 = menuRepository.save(Menu.builder()
                .title("Al Bahja Traditional Menu")
                .category("Omani Cuisine")
                .owner(user1)
                .build());

        Menu menu2 = menuRepository.save(Menu.builder()
                .title("Dhofar Coastal Delights")
                .category("Seafood")
                .owner(user2)
                .build());

        Menu menu3 = menuRepository.save(Menu.builder()
                .title("Muscat BBQ Selection")
                .category("Grills")
                .owner(user3)
                .build());

        Menu menu4 = menuRepository.save(Menu.builder()
                .title("Nizwa Oasis Sweets")
                .category("Desserts")
                .owner(user4)
                .build());

        menuItemRepository.save(MenuItem.builder()
                .name("Shuwa Laham")
                .description("Slow-cooked spiced lamb wrapped in banana leaves, served with rice")
                .price(new BigDecimal("12.500"))
                .available(true)
                .menu(menu1)
                .build());

        menuItemRepository.save(MenuItem.builder()
                .name("Mashuai")
                .description("Spiced kingfish with aromatic lemon rice")
                .price(new BigDecimal("8.000"))
                .available(true)
                .menu(menu2)
                .build());

        menuItemRepository.save(MenuItem.builder()
                .name("Mishkak Beef")
                .description("Omani-style skewered beef with traditional spices")
                .price(new BigDecimal("5.500"))
                .available(true)
                .menu(menu3)
                .build());

        menuItemRepository.save(MenuItem.builder()
                .name("Omani Halwa with Kahwa")
                .description("Traditional date halwa served with Omani coffee")
                .price(new BigDecimal("4.000"))
                .available(true)
                .menu(menu4)
                .build());
    }
}
