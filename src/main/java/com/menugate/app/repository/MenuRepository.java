package com.menugate.app.repository;

import com.menugate.app.model.Menu;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface MenuRepository extends JpaRepository<Menu, Long> {

    List<Menu> findByOwnerEmail(String ownerEmail);

    Optional<Menu> findByMenuIdAndOwnerEmail(Long menuId, String ownerEmail);

    List<Menu> findAllByOrderByMenuIdAsc();
}
